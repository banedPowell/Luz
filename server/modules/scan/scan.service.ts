import { readdir, stat } from 'node:fs/promises'
import { join, extname } from 'node:path'
import { eq } from 'drizzle-orm'
import { getDb } from '../../infrastructure/db/client'
import * as schema from '../../infrastructure/db/schema'
import { DEFAULT_SCAN_STATE, type ScanState } from '#shared/domain/system'
import { settingsService } from '../settings/settings.service'
import { libraryService } from '../library/library.service'
import { metadataService } from '../metadata/metadata.service'
import { artworkService } from '../artwork/artwork.service'
import { ffprobeService } from '../../infrastructure/ffmpeg/ffprobe.service'
import { nanoid } from 'nanoid'
import type { Track } from '#shared/domain/track'

const AUDIO_EXTS = new Set(['.mp3', '.flac', '.m4a', '.opus', '.ogg', '.wav', '.ape'])

async function walkDir(dir: string): Promise<string[]> {
  const files: string[] = []
  try {
    const entries = await readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        files.push(...await walkDir(full))
      } else if (AUDIO_EXTS.has(extname(entry.name).toLowerCase())) {
        files.push(full)
      }
    }
  } catch { /* ignore */ }
  return files
}

function readScanState(): ScanState {
  const row = getDb().select().from(schema.scanState).limit(1).get()
  return row?.data ?? { ...DEFAULT_SCAN_STATE }
}

function writeScanState(state: ScanState): void {
  const db = getDb()
  const row = db.select().from(schema.scanState).limit(1).get()
  if (row) {
    db.update(schema.scanState).set({ data: state }).where(eq(schema.scanState.id, row.id)).run()
  } else {
    db.insert(schema.scanState).values({ data: state }).run()
  }
}

export class ScanService {
  private state: ScanState = { ...DEFAULT_SCAN_STATE }

  async getStatus(): Promise<ScanState> {
    return readScanState()
  }

  async start(): Promise<ScanState> {
    const current = readScanState()
    if (current.running) return current

    const settings = settingsService.get()
    this.state = {
      running: true,
      progress: 0,
      filesFound: 0,
      filesProcessed: 0,
      errors: [],
      startedAt: new Date().toISOString()
    }
    writeScanState(this.state)

    this.runScan(settings.libraryPath).catch(() => {})
    return this.state
  }

  private async runScan(storagePath: string): Promise<void> {
    try {
      const files = await walkDir(storagePath)
      this.state.filesFound = files.length
      const existing = libraryService.getTracks()
      const existingPaths = new Set(existing.map(t => t.file.path))

      for (let i = 0; i < files.length; i++) {
        const filePath = files[i]
        if (!existingPaths.has(filePath)) {
          const parsed = await metadataService.readTagsWithFormat(filePath)
          if (parsed) {
            const tags = parsed.metadata
            const st = await stat(filePath)
            const artist = libraryService.resolveOrCreateArtist(tags.artist)
            const probe = await ffprobeService.probeFile(filePath).catch(() => null)

            const now = new Date().toISOString()
            const ext = extname(filePath).slice(1)
            const track: Track = {
              id: nanoid(),
              artistId: artist.id,
              playlistIds: [],
              file: {
                path: filePath,
                size: st.size,
                codec: probe?.codec || ext,
                format: ext,
                duration: probe?.duration ?? parsed.duration,
                bitrate: probe?.bitrate ?? parsed.bitrate
              },
              metadata: {
                original: tags,
                library: { ...tags },
                file: { ...tags },
                folder: {
                  artist: tags.artist,
                  album: tags.album,
                  filename: filePath.split(/[/\\]/).pop() || 'track.mp3'
                }
              },
              createdAt: now,
              updatedAt: now
            }
            libraryService.indexTrack(track)
            if (track.albumId) {
              await artworkService.extractAndSaveForAlbum(track.albumId, filePath).catch(() => {})
            }
            await artworkService.extractAndSaveForArtist(artist.id, filePath).catch(() => {})
          }
        }
        this.state.filesProcessed = i + 1
        this.state.progress = Math.round(((i + 1) / files.length) * 100)
        writeScanState(this.state)
      }

      for (const track of existing) {
        if (!files.includes(track.file.path)) {
          libraryService.updateTrack(track.id, { missing: true })
        }
      }
    } catch (err) {
      this.state.errors.push(err instanceof Error ? err.message : 'Scan error')
    } finally {
      this.state.running = false
      this.state.finishedAt = new Date().toISOString()
      writeScanState(this.state)
    }
  }
}

export const scanService = new ScanService()
