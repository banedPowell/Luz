import { EventEmitter } from 'node:events'
import { readdir, stat, mkdir, rename, rm, rmdir } from 'node:fs/promises'
import { join, extname, dirname, basename } from 'node:path'
import { nanoid } from 'nanoid'
import { eq } from 'drizzle-orm'
import { getDb } from '../../infrastructure/db/client'
import * as schema from '../../infrastructure/db/schema'
import type { DownloadJob, DownloadAnalysis, DownloadOptions, DestinationContext } from '#shared/domain/download'
import type { Track } from '#shared/domain/track'
import { createYtDlpServices } from '../../infrastructure/ytdlp/ytdlp.service'
import { ytdlpCommandBuilder,
  getStagingDir,
  resolveFinalFilePath,
  buildCookieArgs
} from '../../infrastructure/ytdlp/command-builder'
import type { YtDlpProgressState } from '../../infrastructure/ytdlp/progress'
import { killProcess } from '../../infrastructure/ytdlp/command'
import { formatYtDlpError, isYoutubeAuthFailure } from '../../infrastructure/ytdlp/errors'
import { settingsService } from '../settings/settings.service'
import { metadataService, metadataTransformer, normalizeFolderArtist } from '../metadata/metadata.service'
import { libraryService } from '../library/library.service'
import { cacheService } from '../cache/cache.service'
import { logger } from '../../infrastructure/logger/job-logger'
import { artworkService } from '../artwork/artwork.service'
import { ffprobeService } from '../../infrastructure/ffmpeg/ffprobe.service'
import { resolveJobDestination, resolvePreviewDestination } from './destination'
import { resolveStoragePath } from '../../infrastructure/paths/data-dir'

export const downloadEvents = new EventEmitter()

const AUDIO_EXTS = new Set(['.mp3', '.flac', '.m4a', '.opus', '.ogg', '.wav', '.ape'])

async function relocateTrackFile(
  filePath: string,
  targetPath: string,
  cleanupRoot?: string
): Promise<string> {
  if (filePath === targetPath) return filePath
  await mkdir(dirname(targetPath), { recursive: true })
  await rename(filePath, targetPath).catch(async () => {
    const { copyFile, unlink } = await import('node:fs/promises')
    await copyFile(filePath, targetPath)
    await unlink(filePath).catch(() => {})
  })
  if (cleanupRoot) await removeEmptyDirs(dirname(filePath), cleanupRoot)
  return targetPath
}

async function removeEmptyDirs(dir: string, stopAt: string): Promise<void> {
  let current = dir
  while (current && current !== stopAt) {
    try {
      const entries = await readdir(current)
      if (entries.length > 0) break
      await rmdir(current)
      const parent = dirname(current)
      if (parent === current) break
      current = parent
    } catch {
      break
    }
  }
}

class DownloadQueueProcessor {
  private processing = false

  async enqueue(job: DownloadJob): Promise<DownloadJob> {
    this.saveJob(job, true)
    this.emit('queue', this.getActiveQueue())
    this.processNext()
    return job
  }

  getActiveQueue(): DownloadJob[] {
    return getDb().select().from(schema.downloadJobs)
      .where(eq(schema.downloadJobs.isActive, true))
      .all().map(r => r.data)
  }

  getHistory(): DownloadJob[] {
    return getDb().select().from(schema.downloadJobs)
      .where(eq(schema.downloadJobs.isActive, false))
      .all().map(r => r.data)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 50)
  }

  private saveJob(job: DownloadJob, isActive: boolean): void {
    const db = getDb()
    const existing = db.select().from(schema.downloadJobs).where(eq(schema.downloadJobs.id, job.id)).get()
    const row = {
      id: job.id,
      data: job,
      status: job.status,
      isActive,
      createdAt: job.createdAt,
      updatedAt: new Date().toISOString()
    }
    job.updatedAt = row.updatedAt
    if (existing) {
      db.update(schema.downloadJobs).set(row).where(eq(schema.downloadJobs.id, job.id)).run()
    } else {
      db.insert(schema.downloadJobs).values(row).run()
    }
  }

  private emit(event: string, data: unknown) {
    downloadEvents.emit(event, data)
  }

  private async updateJob(jobId: string, update: Partial<DownloadJob>): Promise<DownloadJob> {
    const db = getDb()
    const row = db.select().from(schema.downloadJobs).where(eq(schema.downloadJobs.id, jobId)).get()
    if (!row) throw new Error('Job not found')
    const job = { ...row.data, ...update, updatedAt: new Date().toISOString() }
    this.saveJob(job, row.isActive)
    this.emit('job', job)
    this.emit('queue', this.getActiveQueue())
    return job
  }

  async cancel(jobId: string): Promise<void> {
    killProcess(jobId)
    const job = await this.updateJob(jobId, { status: 'cancelled', step: 'done' })
    this.saveJob(job, false)
    this.emit('queue', this.getActiveQueue())
  }

  async dismiss(jobId: string): Promise<void> {
    getDb().delete(schema.downloadJobs).where(eq(schema.downloadJobs.id, jobId)).run()
    this.emit('queue', this.getActiveQueue())
    this.emit('history', this.getHistory())
  }

  /** Reprend les jobs interrompus (ex. redémarrage serveur). */
  resumeQueue(): void {
    const db = getDb()
    const rows = db.select().from(schema.downloadJobs)
      .where(eq(schema.downloadJobs.isActive, true))
      .all()

    for (const row of rows) {
      const stuck = ['downloading', 'updating_library', 'converting', 'moving'].includes(row.data.status)
      if (stuck) {
        const job: DownloadJob = {
          ...row.data,
          status: 'queued',
          progress: 0,
          updatedAt: new Date().toISOString()
        }
        db.update(schema.downloadJobs)
          .set({ data: job, status: 'queued', updatedAt: job.updatedAt })
          .where(eq(schema.downloadJobs.id, row.id))
          .run()
      }
    }

    this.processNext()
  }

  private async processNext(): Promise<void> {
    if (this.processing) return
    const queue = this.getActiveQueue()
    const job = queue.find(j => j.status === 'queued' || j.status === 'waiting_confirmation')
    if (!job) return

    this.processing = true
    try {
      await this.processJob(job)
    } finally {
      this.processing = false
      const remaining = this.getActiveQueue().some(j =>
        j.status === 'queued' || j.status === 'waiting_confirmation'
      )
      if (remaining) this.processNext()
    }
  }

  private async processJob(job: DownloadJob): Promise<void> {
    const { executor } = createYtDlpServices()
    const settings = settingsService.get()
    const selectedTracks = job.tracks.filter(t => t.selected)

    if (!selectedTracks.length) {
      await this.updateJob(job.id, {
        status: 'failed',
        errors: [...job.errors, 'Aucun morceau sélectionné']
      })
      this.saveJob({ ...job, status: 'failed' }, false)
      return
    }

    await this.updateJob(job.id, { status: 'downloading', step: 'download', progress: 0 })
    logger.info(job.id, `Starting download for ${selectedTracks.length} track(s)`)

    for (let i = 0; i < selectedTracks.length; i++) {
      selectedTracks[i].progress = 0
      selectedTracks[i].status = i === 0 ? 'downloading' : 'queued'
    }
    this.emit('job', {
      ...job,
      status: 'downloading',
      progress: 0,
      tracks: job.tracks.map(t => ({ ...t }))
    })

    const playlistItems = selectedTracks.length < job.tracks.length
      ? selectedTracks.map((_, i) => job.tracks.indexOf(selectedTracks[i]) + 1).join(',')
      : undefined

    let artistOverride: string | undefined
    let albumOverride: string | undefined
    if (job.destinationContext.artistId) {
      artistOverride = normalizeFolderArtist(
        libraryService.getArtist(job.destinationContext.artistId).name
      )
    }
    if (job.destinationContext.albumId) {
      albumOverride = libraryService.getAlbum(job.destinationContext.albumId).title
    }

    const buildArgs = (skipCookies?: boolean) => ytdlpCommandBuilder.buildDownloadArgs({
      url: job.url,
      options: job.options,
      settings,
      destinationContext: job.destinationContext,
      jobId: job.id,
      outputTemplate: job.outputTemplate,
      artistOverride,
      albumOverride,
      playlistItems,
      customArgs: job.customArgs,
      trackCount: selectedTracks.length
    }, { skipCookies })

    let args = buildArgs()

    const stagingDir = getStagingDir(settings, job.id)
    await mkdir(stagingDir, { recursive: true })

    const cmdPreview = executor.preview(args)
    const dest = resolveJobDestination(job, settings)
    const finalPreview = ytdlpCommandBuilder.previewFinalPath({
      settings,
      destinationContext: job.destinationContext,
      jobId: job.id,
      outputTemplate: dest.template,
      artistOverride,
      albumOverride,
      playlistTitle: dest.playlistTitle,
      samplePlaylist: dest.playlistTitle,
      destinationMode: dest.mode
    })
    logger.info(job.id, `Command: ${cmdPreview}`)
    logger.info(job.id, `Destination finale: ${finalPreview}`)
    this.emit('log', { jobId: job.id, message: cmdPreview })
    this.emit('log', { jobId: job.id, message: `→ Destination: ${finalPreview}` })

    try {
      const selectedCount = selectedTracks.length

      let lastProgressEmit = 0

      const applyProgress = (state: YtDlpProgressState) => {
        const ordered = selectedTracks.slice().sort((a, b) => a.order - b.order)
        const total = state.totalItems ?? selectedCount
        const currentItem = state.currentItem
        let jobProgress = Math.round(state.jobPercent)

        if (currentItem != null && total > 0) {
          const itemPct = state.itemPercent ?? 0
          jobProgress = Math.round(((currentItem - 1) / total) * 100 + (itemPct / total))

          for (let i = 0; i < ordered.length; i++) {
            const t = ordered[i]
            const n = i + 1
            if (n < currentItem) {
              t.progress = 100
              t.status = 'downloading'
            } else if (n === currentItem) {
              t.progress = Math.round(itemPct)
              t.status = 'downloading'
            } else {
              t.progress = 0
              if (n > currentItem) t.status = 'queued'
            }
          }
        } else if (selectedCount === 1 && state.itemPercent != null) {
          ordered[0].progress = Math.round(state.itemPercent)
          ordered[0].status = 'downloading'
          jobProgress = Math.round(state.itemPercent)
        }
        // Multi-morceaux sans index : barre globale uniquement (pas de sync sur tous les morceaux)

        const now = Date.now()
        if (now - lastProgressEmit < 120 && jobProgress < 99) return
        lastProgressEmit = now

        const snapshot: DownloadJob = {
          ...job,
          progress: jobProgress,
          status: 'downloading',
          tracks: job.tracks.map(t => ({ ...t }))
        }
        this.saveJob(snapshot, true)
        this.emit('job', snapshot)
      }

      let result = await executor.download(args, job.id, selectedCount, applyProgress)
      let newFiles = await listAudioFiles(stagingDir)

      if (
        result.code !== 0
        && newFiles.length === 0
        && buildCookieArgs(settings).length > 0
        && isYoutubeAuthFailure(result.stderr)
      ) {
        logger.info(job.id, 'Retrying download without cookies (auth failure, staging empty)')
        args = buildArgs(true)
        logger.info(job.id, `Retry command: ${executor.preview(args)}`)
        result = await executor.download(args, job.id, selectedCount, applyProgress)
        newFiles = await listAudioFiles(stagingDir)
      }

      if (result.code !== 0 && newFiles.length === 0) {
        const errMsg = formatYtDlpError(result.stderr, 'Téléchargement échoué')
        logger.error(job.id, result.stderr)
        await this.updateJob(job.id, {
          status: 'failed',
          errors: [...job.errors, errMsg]
        })
        this.saveJob({ ...job, status: 'failed' }, false)
        return
      }

      const partialWarning = result.code !== 0
        ? formatYtDlpError(result.stderr, 'Certains morceaux n\'ont pas pu être téléchargés')
        : undefined

      if (partialWarning) {
        logger.warn(job.id, partialWarning)
        this.emit('log', { jobId: job.id, message: partialWarning })
      }

      await this.updateJob(job.id, { step: 'index', status: 'updating_library', progress: 95 })

      for (const t of selectedTracks) {
        t.progress = 100
        t.status = 'finished'
      }
      this.emit('job', {
        ...job,
        progress: 95,
        status: 'updating_library',
        tracks: job.tracks.map(t => ({ ...t }))
      })

      logger.info(job.id, `Indexing ${newFiles.length} file(s) from staging → ${finalPreview}`)

      for (const filePath of newFiles) {
        await this.indexFile(filePath, job, settings, artistOverride, albumOverride)
      }

      await rm(stagingDir, { recursive: true, force: true }).catch(() => {})

      const finishErrors = partialWarning ? [...job.errors, partialWarning] : job.errors
      await this.updateJob(job.id, {
        status: 'finished',
        step: 'done',
        progress: 100,
        errors: finishErrors
      })
      const finished = await this.updateJob(job.id, { status: 'finished', errors: finishErrors })
      this.saveJob(finished, false)
      this.emit('log', {
        jobId: job.id,
        message: `${newFiles.length} morceau(x) importé(s) · ${finalPreview}`
      })
      this.emit('library:updated', {})
      this.emit('history', this.getHistory())
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      logger.error(job.id, message)
      await this.updateJob(job.id, { status: 'failed', errors: [...job.errors, message] })
      this.saveJob({ ...job, status: 'failed' }, false)
    }

    this.emit('queue', this.getActiveQueue())
  }

  private async indexFile(
    filePath: string,
    job: DownloadJob,
    settings: ReturnType<typeof settingsService.get>,
    artistOverride?: string,
    albumOverride?: string
  ): Promise<void> {
    const parsed = await metadataService.readTagsWithFormat(filePath)
    const st = await stat(filePath)
    const ext = extname(filePath).slice(1)
    const tags = parsed?.metadata

    const baseLayers = tags
      ? metadataTransformer.createLayersFromRaw(tags, ext)
      : metadataTransformer.createLayersFromRaw({ artist: 'Unknown', title: 'Unknown' }, ext)
    const layers = metadataService.applyRules(
      baseLayers,
      settings.metadataRules,
      job.options.featStrategy
    )

    const folderArtistName = artistOverride
      ? normalizeFolderArtist(artistOverride)
      : layers.folder.artist

    const artist = job.destinationContext.artistId
      ? libraryService.getArtist(job.destinationContext.artistId)
      : libraryService.resolveOrCreateArtist(folderArtistName)

    let albumId: string | undefined
    const isSingle = job.destinationContext.type === 'singles'
    if (isSingle) {
      albumId = undefined
    } else if (job.destinationContext.albumId) {
      albumId = job.destinationContext.albumId
    } else if (tags?.album) {
      albumId = libraryService.resolveOrCreateAlbum(tags.album, artist.id, 'album')?.id
    }

    const dest = resolveJobDestination(job, settings)

    const targetPath = resolveStoragePath(resolveFinalFilePath(
      dest.template,
      settings,
      job.destinationContext,
      {
        folderArtist: folderArtistName,
        album: layers.folder.album,
        title: layers.library.title,
        ext,
        artistOverride,
        albumOverride,
        playlistTitle: dest.playlistTitle,
        destinationMode: dest.mode
      }
    ))

    const uniqueTargetPath = libraryService.resolveUniqueTrackPath(targetPath)

    let finalPath = filePath
    const stagingDir = getStagingDir(settings, job.id)
    try {
      finalPath = await relocateTrackFile(filePath, uniqueTargetPath, stagingDir)
    } catch (err) {
      logger.error(job.id, `Relocation failed: ${err instanceof Error ? err.message : err}`)
    }

    layers.folder.filename = basename(finalPath)

    const probe = await ffprobeService.probeFile(finalPath).catch(() => null)
    const now = new Date().toISOString()
    const track: Track = {
      id: nanoid(),
      artistId: artist.id,
      albumId,
      playlistIds: job.destinationContext.playlistId ? [job.destinationContext.playlistId] : [],
      file: {
        path: finalPath,
        size: st.size,
        codec: probe?.codec || ext,
        format: ext,
        duration: probe?.duration ?? parsed?.duration,
        bitrate: probe?.bitrate ?? parsed?.bitrate
      },
      metadata: layers,
      source: { url: job.url, downloadedAt: now },
      createdAt: now,
      updatedAt: now
    }

    libraryService.indexTrack(track, job.destinationContext)

    if (albumId) {
      await artworkService.extractAndSaveForAlbum(albumId, finalPath).catch(() => {})
    }
    await artworkService.extractAndSaveForArtist(artist.id, finalPath).catch(() => {})

    await cacheService.register({
      fingerprint: cacheService.computeFingerprint(layers.library.artist, layers.library.title, job.url),
      trackId: track.id,
      sourceUrl: job.url,
      locations: { albumId, playlistIds: track.playlistIds }
    })
  }
}

async function listAudioFiles(dir: string): Promise<string[]> {
  const result: string[] = []
  async function walk(d: string) {
    try {
      const entries = await readdir(d, { withFileTypes: true })
      for (const e of entries) {
        const full = join(d, e.name)
        if (e.isDirectory()) await walk(full)
        else if (AUDIO_EXTS.has(extname(e.name).toLowerCase())) result.push(full)
      }
    } catch { /* ignore */ }
  }
  await walk(dir)
  return result
}

const processor = new DownloadQueueProcessor()

export class DownloadService {
  async analyze(url: string): Promise<DownloadAnalysis> {
    return createYtDlpServices().analyzer.analyze(url)
  }

  async previewCommand(job: {
    url: string
    options: DownloadOptions
    destinationContext: DestinationContext
    outputTemplate?: string
    customArgs?: string[]
    sourceTitle?: string
    trackCount?: number
  }): Promise<string> {
    const cleanUrl = job.url.trim()
    if (!cleanUrl || cleanUrl.startsWith('ERROR:')) {
      return 'Collez une URL YouTube ou playlist valide pour prévisualiser la commande.'
    }

    const settings = settingsService.get()
    const luzPlaylistName = job.destinationContext.playlistId
      ? libraryService.getPlaylist(job.destinationContext.playlistId).name
      : undefined

    const dest = resolvePreviewDestination({
      url: cleanUrl,
      destinationContext: job.destinationContext,
      options: job.options,
      outputTemplate: job.outputTemplate,
      sourceTitle: job.sourceTitle,
      trackCount: job.trackCount,
      luzPlaylistName
    }, settings)

    const args = ytdlpCommandBuilder.buildDownloadArgs({
      url: cleanUrl,
      options: job.options,
      settings,
      destinationContext: job.destinationContext,
      jobId: '__preview__',
      outputTemplate: dest.template,
      customArgs: job.customArgs,
      trackCount: job.trackCount
    })
    const cmd = createYtDlpServices().executor.preview(args)
    const finalPath = ytdlpCommandBuilder.previewFinalPath({
      settings,
      destinationContext: job.destinationContext,
      jobId: '__preview__',
      outputTemplate: dest.template,
      sampleArtist: 'Artiste Principal',
      sampleAlbum: 'Mon Album',
      sampleTitle: 'Mon Titre (feat. Guest)',
      samplePlaylist: dest.playlistTitle,
      playlistTitle: dest.playlistTitle,
      destinationMode: dest.mode
    })

    const destLabel = dest.mode === 'playlist'
      ? `Dossier playlist · ${dest.playlistTitle}`
      : 'Bibliothèque (artiste / album)'

    return `${cmd}\n\n# Destination finale (${destLabel}):\n# ${finalPath}`
  }

  getQueue() { return processor.getActiveQueue() }
  getHistory() { return processor.getHistory() }

  async enqueue(data: {
    url: string
    tracks: DownloadJob['tracks']
    options: DownloadOptions
    destinationContext: DestinationContext
    outputTemplate?: string
    customArgs?: string[]
    sourceTitle?: string
  }): Promise<DownloadJob> {
    const now = new Date().toISOString()
    const job: DownloadJob = {
      id: nanoid(),
      url: data.url,
      status: 'queued',
      step: 'download',
      progress: 0,
      destinationContext: data.destinationContext,
      tracks: data.tracks,
      options: data.options,
      outputTemplate: data.outputTemplate,
      customArgs: data.customArgs,
      sourceTitle: data.sourceTitle,
      errors: [],
      createdAt: now,
      updatedAt: now
    }
    return processor.enqueue(job)
  }

  cancel(jobId: string) { return processor.cancel(jobId) }
  dismiss(jobId: string) { return processor.dismiss(jobId) }

  clearQueue(): void {
    const db = getDb()
    db.update(schema.downloadJobs).set({ isActive: false }).where(eq(schema.downloadJobs.isActive, true)).run()
    downloadEvents.emit('queue', [])
  }

  resumeQueue(): void {
    processor.resumeQueue()
  }
}

export const downloadService = new DownloadService()
