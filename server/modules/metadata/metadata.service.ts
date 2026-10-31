import { buildTrackFilename } from '#shared/utils/download-destination'
import type { MetadataLayers, TrackMetadata } from '#shared/domain/track'
import { existsSync } from 'node:fs'
import { extname } from 'node:path'
import NodeID3 from 'node-id3'
import { checkBinary, runCommand } from '../../infrastructure/ytdlp/command'
import { ffprobeService } from '../../infrastructure/ffmpeg/ffprobe.service'

const EXIFTOOL_CANDIDATES = [
  'exiftool',
  'exiftool.exe',
  'C:\\Program Files\\ExifTool\\exiftool.exe',
  'C:\\Program Files (x86)\\ExifTool\\exiftool.exe'
]

const ATOMICPARSLEY_CANDIDATES = ['AtomicParsley', 'AtomicParsley.exe', 'atomicparsley']

const FEAT_REGEX = /\s*(?:\(|\[)?\s*(?:feat\.?|ft\.?|featuring)\s+([^)\]]+)(?:\)|\])?/gi

function stripFeats(title: string): string {
  return title.replace(FEAT_REGEX, '').replace(/\s+/g, ' ').trim()
}

function extractFeats(title: string): string[] {
  const feats: string[] = []
  let match: RegExpExecArray | null
  const re = /\s*(?:\(|\[)?\s*(?:feat\.?|ft\.?|featuring)\s+([^)\]]+)(?:\)|\])?/gi
  while ((match = re.exec(title)) !== null) {
    feats.push(match[1].trim())
  }
  return feats
}

export function normalizeFolderArtist(name: string): string {
  let n = name.trim()
  n = n.replace(FEAT_REGEX, '').trim()
  // « Artist ft Someone » sans parenthèses
  n = n.replace(/\s+(?:feat\.?|ft\.?|featuring|with)\s+.+/gi, '').trim()
  n = n.split(/\s*(?:,|&|\bx\b|\||\/|\+)\s*/i)[0]?.trim() || n
  return n.replace(/[<>:"/\\|?*]/g, '_').trim() || 'Unknown Artist'
}

function sanitizePathSegment(s?: string): string | undefined {
  return s?.replace(/[<>:"/\\|?*]/g, '_')
}

export class MetadataTransformer {
  applyRules(layers: MetadataLayers, rules: MetadataRules, overrideStrategy?: FeatStrategy): MetadataLayers {
    const featStrategy = overrideStrategy || rules.featStrategy
    const original = { ...layers.original }
    let libraryTitle = original.title
    let fileArtist = original.artist
    const feats = extractFeats(original.title)

    if (featStrategy === 'metadata_only' || featStrategy === 'title_only') {
      libraryTitle = stripFeats(original.title)
    }
    if (featStrategy === 'metadata_only' && feats.length) {
      fileArtist = `${normalizeFolderArtist(original.artist)} feat. ${feats.join(', ')}`
    }

    const libraryArtist = normalizeFolderArtist(original.artist)
    const library: TrackMetadata = {
      ...original,
      title: libraryTitle,
      artist: libraryArtist
    }
    const file: TrackMetadata = {
      ...original,
      title: libraryTitle,
      artist: fileArtist
    }

    const ext = layers.folder.filename.split('.').pop() || 'mp3'
    const filename = buildTrackFilename(libraryArtist, libraryTitle, ext)

    return {
      original,
      library,
      file,
      folder: {
        artist: sanitizePathSegment(libraryArtist) || 'Unknown Artist',
        album: sanitizePathSegment(original.album),
        filename
      }
    }
  }

  createLayersFromRaw(raw: TrackMetadata, ext = 'mp3'): MetadataLayers {
    const artist = raw.artist || 'Unknown Artist'
    const title = raw.title || 'Unknown Title'
    return {
      original: { ...raw },
      library: { ...raw },
      file: { ...raw },
      folder: {
        artist: raw.artist,
        album: raw.album,
        filename: buildTrackFilename(artist, title, ext)
      }
    }
  }
}

export const metadataTransformer = new MetadataTransformer()

function extractDateFromMetadata(metadata: Awaited<ReturnType<Awaited<typeof import('music-metadata')>['parseFile']>>): string | undefined {
  if (metadata.common.date) return String(metadata.common.date)
  for (const native of Object.values(metadata.native || {})) {
    if (!native || typeof native !== 'object') continue
    for (const [key, value] of Object.entries(native)) {
      const k = key.toLowerCase()
      if (!['date', 'tdrc', 'tdrl', 'tdor', 'year'].includes(k)) continue
      const v = Array.isArray(value) ? value[0] : value
      if (v != null && String(v).trim()) return String(v).trim()
    }
  }
  if (metadata.common.year) return String(metadata.common.year)
  return undefined
}

function parseTrackNumberValue(value: unknown): number | undefined {
  if (value == null) return undefined
  const raw = Array.isArray(value) ? value[0] : value
  if (typeof raw === 'number' && !Number.isNaN(raw)) return Math.trunc(raw)
  const s = String(raw).trim()
  if (!s) return undefined
  const m = /^(\d+)/.exec(s)
  if (!m) return undefined
  const n = parseInt(m[1], 10)
  return Number.isNaN(n) ? undefined : n
}

function trackNumberFromNative(
  metadata: Awaited<ReturnType<Awaited<typeof import('music-metadata')>['parseFile']>>
): number | undefined {
  if (metadata.common.track?.no != null) {
    return parseTrackNumberValue(metadata.common.track.no)
  }
  for (const native of Object.values(metadata.native || {})) {
    if (!native || typeof native !== 'object') continue
    for (const [key, value] of Object.entries(native)) {
      const k = key.toLowerCase()
      if (k === 'trck' || k === 'tracknumber' || k === 'track') {
        const parsed = parseTrackNumberValue(value)
        if (parsed != null) return parsed
      }
    }
  }
  return undefined
}

function trackNumberFromFfprobeTags(tags: Record<string, string>): number | undefined {
  for (const key of Object.keys(tags)) {
    const k = key.toLowerCase()
    if (k === 'track' || k === 'tracknumber' || k === 'trck' || k === '©trk' || k === 'trkn') {
      const parsed = parseTrackNumberValue(tags[key])
      if (parsed != null) return parsed
    }
  }
  return undefined
}

async function findBinary(candidates: string[]): Promise<string | null> {
  for (const cmd of candidates) {
    if (cmd.includes('\\') || cmd.includes('/')) {
      if (!existsSync(cmd)) continue
    }
    const { available } = await checkBinary(cmd)
    if (available) return cmd
  }
  return null
}

export async function findExiftoolPath(): Promise<string | null> {
  for (const cmd of EXIFTOOL_CANDIDATES) {
    if ((cmd.includes('\\') || cmd.includes('/')) && !existsSync(cmd)) continue
    const result = await runCommand(cmd, ['-ver'])
    if (result.code === 0 && result.stdout.trim()) return cmd
  }
  return null
}

function ffmpegTmpPath(filePath: string): string {
  return filePath.replace(/(\.[^./\\]+)$/, '.luz-tmp$1')
}

async function readTrackNumberViaExiftool(filePath: string, exiftoolPath: string): Promise<number | undefined | null> {
  const result = await runCommand(exiftoolPath, ['-Track', '-s', '-s', '-s', filePath])
  if (result.code !== 0) return null
  const raw = result.stdout.trim()
  if (!raw) return undefined
  return parseTrackNumberValue(raw)
}

function tagsFromMetadata(metadata: Awaited<ReturnType<Awaited<typeof import('music-metadata')>['parseFile']>>): TrackMetadata {
  const date = extractDateFromMetadata(metadata)
  return {
    artist: metadata.common.artist || 'Unknown Artist',
    album: metadata.common.album,
    title: metadata.common.title || 'Unknown Title',
    trackNumber: trackNumberFromNative(metadata),
    discNumber: metadata.common.disk?.no,
    genre: metadata.common.genre?.[0],
    year: metadata.common.year,
    date,
    comment: metadata.common.comment?.[0]
  }
}

export class MetadataService {
  async readTrackNumberFromFile(filePath: string): Promise<number | undefined> {
    const exiftool = await findExiftoolPath()
    if (exiftool) {
      const fromExif = await readTrackNumberViaExiftool(filePath, exiftool)
      if (fromExif !== null) return fromExif
    }

    try {
      const { parseFile } = await import('music-metadata')
      const metadata = await parseFile(filePath)
      const fromMeta = trackNumberFromNative(metadata)
      if (fromMeta != null) return fromMeta
    } catch { /* ignore */ }

    try {
      const probe = await ffprobeService.probeFile(filePath)
      return trackNumberFromFfprobeTags(probe.tags)
    } catch {
      return undefined
    }
  }

  async readTags(_filePath: string): Promise<TrackMetadata | null> {
    try {
      const { parseFile } = await import('music-metadata')
      const metadata = await parseFile(_filePath)
      return tagsFromMetadata(metadata)
    } catch {
      return null
    }
  }

  async readTagsWithFormat(filePath: string): Promise<{ metadata: TrackMetadata, duration?: number, bitrate?: number } | null> {
    try {
      const { parseFile } = await import('music-metadata')
      const m = await parseFile(filePath)
      return {
        metadata: tagsFromMetadata(m),
        duration: m.format.duration,
        bitrate: m.format.bitrate ? Math.round(m.format.bitrate / 1000) : undefined
      }
    } catch {
      return null
    }
  }

  applyRules(layers: MetadataLayers, rules: MetadataRules, overrideStrategy?: FeatStrategy): MetadataLayers {
    return metadataTransformer.applyRules(layers, rules, overrideStrategy)
  }

  async writeTrackNumberToFile(filePath: string, trackNumber: number): Promise<void> {
    const { existsSync } = await import('node:fs')
    if (!existsSync(filePath)) {
      throw new Error('Fichier audio introuvable')
    }

    const ext = extname(filePath).toLowerCase()

    if (ext === '.mp3') {
      const ok = NodeID3.update({ TRCK: String(trackNumber) }, filePath)
      if (!ok) {
        throw new Error(NodeID3.getLastError()?.message || 'Impossible d\'écrire le tag TRCK (MP3)')
      }
    } else if (['.m4a', '.mp4'].includes(ext)) {
      await this.writeM4aTrackNumber(filePath, trackNumber)
    } else if (['.flac', '.ogg', '.opus'].includes(ext)) {
      await this.writeTrackNumberViaFfmpeg(filePath, 'TRACKNUMBER', trackNumber)
    } else {
      await this.writeTrackNumberViaFfmpeg(filePath, 'track', trackNumber)
    }

    const verified = await this.readTrackNumberFromFile(filePath)
    if (verified !== trackNumber) {
      throw new Error(`N° piste non vérifié sur disque (attendu ${trackNumber}, lu ${verified ?? 'aucun'})`)
    }
  }

  private async writeM4aTrackNumber(filePath: string, trackNumber: number): Promise<void> {
    const failures: string[] = []

    const exiftool = await findExiftoolPath()
    if (exiftool) {
      const result = await runCommand(exiftool, [
        '-overwrite_original',
        `-Track=${trackNumber}`,
        filePath
      ])
      if (result.code === 0) return
      failures.push(`ExifTool: ${result.stderr?.trim() || result.stdout?.trim() || 'échec'}`)
    }

    const atomicParsley = await findBinary(ATOMICPARSLEY_CANDIDATES)
    if (atomicParsley) {
      const result = await runCommand(atomicParsley, [
        filePath,
        '--tracknum', String(trackNumber),
        '--overWrite'
      ])
      if (result.code === 0) return
      failures.push(`AtomicParsley: ${result.stderr?.trim() || 'échec'}`)
    }

    try {
      await this.writeTrackNumberViaFfmpeg(filePath, 'track', trackNumber)
      return
    } catch (e) {
      failures.push(e instanceof Error ? e.message : 'FFmpeg échec')
    }

    const installHint = 'Installez ExifTool : winget install ExifTool.ExifTool'
    const hint = failures.length ? failures.join(' · ') : installHint
    throw new Error(`Impossible d'écrire le N° piste M4A. ${hint}`)
  }

  private async writeTrackNumberViaFfmpeg(filePath: string, key: string, trackNumber: number): Promise<void> {
    const config = useRuntimeConfig()
    const ffmpegPath = config.ffmpegPath || 'ffmpeg'
    const tmpPath = ffmpegTmpPath(filePath)
    const ext = extname(filePath).toLowerCase()
    const args = [
      '-hide_banner', '-loglevel', 'error',
      '-i', filePath,
      '-c', 'copy',
      '-metadata', `${key}=${String(trackNumber)}`,
      '-y'
    ]
    if (['.m4a', '.mp4'].includes(ext)) {
      args.push('-f', 'mp4')
    }
    args.push(tmpPath)
    const result = await runCommand(ffmpegPath, args)
    if (result.code !== 0) {
      const { unlink } = await import('node:fs/promises')
      await unlink(tmpPath).catch(() => {})
      throw new Error(result.stderr?.trim() || 'FFmpeg n\'a pas pu écrire le N° piste')
    }
    const { rename, unlink } = await import('node:fs/promises')
    try {
      await rename(tmpPath, filePath)
    } catch {
      await unlink(filePath).catch(() => {})
      await rename(tmpPath, filePath)
    }
  }

  async writeTags(filePath: string, tags: TrackMetadata): Promise<void> {
    const { existsSync } = await import('node:fs')
    if (!existsSync(filePath)) {
      throw new Error('Fichier audio introuvable')
    }

    const { trackNumber, ...rest } = tags

    const config = useRuntimeConfig()
    const ffmpegPath = config.ffmpegPath || 'ffmpeg'
    const tmpPath = ffmpegTmpPath(filePath)
    const ext = extname(filePath).toLowerCase()
    const args = ['-hide_banner', '-loglevel', 'error', '-i', filePath, '-c', 'copy', '-y']

    const meta = (key: string, value: string | number | undefined) => {
      if (value === undefined || value === null || value === '') return
      args.push('-metadata', `${key}=${String(value)}`)
    }

    meta('artist', rest.artist)
    meta('title', rest.title)
    meta('album', rest.album)
    meta('genre', rest.genre)
    meta('comment', rest.comment)
    meta('date', rest.date || rest.year)
    if (rest.discNumber != null) meta('disc', rest.discNumber)

    if (['.m4a', '.mp4'].includes(ext)) {
      args.push('-f', 'mp4')
    }
    args.push(tmpPath)
    const result = await runCommand(ffmpegPath, args)
    if (result.code !== 0) {
      const { unlink } = await import('node:fs/promises')
      await unlink(tmpPath).catch(() => {})
      throw new Error(result.stderr?.trim() || 'FFmpeg n\'a pas pu écrire les métadonnées')
    }
    const { rename, unlink } = await import('node:fs/promises')
    try {
      await rename(tmpPath, filePath)
    } catch {
      await unlink(filePath).catch(() => {})
      await rename(tmpPath, filePath)
    }

    if (trackNumber != null) {
      await this.writeTrackNumberToFile(filePath, trackNumber)
    }
  }
}

export const metadataService = new MetadataService()
