import { ZipArchive } from 'archiver'
import { getAppConfigDir, getDbPath } from '../../infrastructure/paths/data-dir'
import { closeDb, initDb } from '../../infrastructure/db/client'
import { checkBinary, runCommand } from '../../infrastructure/ytdlp/command'
import { libraryService } from '../library/library.service'
import { cacheService } from '../cache/cache.service'
import { filesystemService } from '../filesystem/filesystem.service'
import { settingsService } from '../settings/settings.service'
import { downloadService } from '../download/download.service'
import type { SystemDiagnostics } from '#shared/domain/system'
import { scanService } from '../scan/scan.service'
import { formatRepairReport, libraryRepairService } from '../library/library-repair.service'
import { findExiftoolPath } from '../metadata/metadata.service'

export class SystemService {
  async getDiagnostics(): Promise<SystemDiagnostics> {
    const config = useRuntimeConfig()
    const settings = settingsService.get()
    const stats = libraryService.getStats()
    const disk = await filesystemService.getDiskSpace(settings.libraryPath)

    const [ytdlp, ffmpeg, exiftoolPath] = await Promise.all([
      checkBinary(config.ytdlpPath || 'yt-dlp'),
      checkBinary(config.ffmpegPath || 'ffmpeg'),
      findExiftoolPath()
    ])
    const exiftool = exiftoolPath
      ? await runCommand(exiftoolPath, ['-ver']).then(r => ({
          available: r.code === 0,
          version: r.stdout.trim() || undefined
        }))
      : { available: false as const }

    return {
      ytdlp: { ...ytdlp, path: config.ytdlpPath || 'yt-dlp' },
      ffmpeg: { ...ffmpeg, path: config.ffmpegPath || 'ffmpeg' },
      exiftool: { ...exiftool, path: exiftoolPath || 'exiftool' },
      disk,
      library: stats,
      cache: { entries: cacheService.getCount(), size: 0 },
      dataDir: getAppConfigDir(),
      libraryPath: settings.libraryPath,
      lastScanAt: settings.lastScanAt,
      errors: []
    }
  }

  async runAction(action: string): Promise<{ success: boolean, message: string }> {
    switch (action) {
      case 'reset-library':
        libraryService.resetLibrary()
        return { success: true, message: 'Bibliothèque réinitialisée' }
      case 'rebuild-cache': {
        const count = await cacheService.rebuild()
        return { success: true, message: `Cache reconstruit (${count} entrées)` }
      }
      case 'clear-queue':
        downloadService.clearQueue()
        return { success: true, message: 'File d\'attente vidée' }
      case 'reset-settings': {
        const { getDefaultSettings } = await import('../../infrastructure/storage/defaults')
        const { settingsRepository } = await import('../settings/settings.repository')
        await settingsRepository.save(getDefaultSettings())
        return { success: true, message: 'Paramètres réinitialisés' }
      }
      case 'rescan-library':
        await scanService.start()
        return { success: true, message: 'Scan démarré' }
      case 'repair-library': {
        const report = await libraryRepairService.repairAll()
        return { success: true, message: formatRepairReport(report) }
      }
      default:
        throw createError({ statusCode: 400, message: `Unknown action: ${action}` })
    }
  }

  async exportData(destPath: string): Promise<void> {
    const configDir = getAppConfigDir()
    const { mkdir, dirname } = await import('node:fs/promises')
    const { createWriteStream } = await import('node:fs')
    await mkdir(dirname(destPath), { recursive: true })

    await new Promise<void>((resolve, reject) => {
      const output = createWriteStream(destPath)
      const archive = new ZipArchive({ zlib: { level: 9 } })
      output.on('close', () => resolve())
      archive.on('error', reject)
      archive.pipe(output)
      archive.directory(configDir, false)
      archive.finalize()
    })
  }

  async importDbFile(srcPath: string): Promise<void> {
    closeDb()
    const configDir = getAppConfigDir()
    const { mkdir, copyFile } = await import('node:fs/promises')
    await mkdir(configDir, { recursive: true })
    await copyFile(srcPath, getDbPath(configDir))
    initDb(configDir)
  }

  async importDirectory(srcDir: string): Promise<void> {
    closeDb()
    const configDir = getAppConfigDir()
    const { rm, mkdir, cp } = await import('node:fs/promises')
    await rm(configDir, { recursive: true, force: true })
    await mkdir(configDir, { recursive: true })
    await cp(srcDir, configDir, { recursive: true })
    initDb(configDir)
  }
}

export const systemService = new SystemService()
