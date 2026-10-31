import { nanoid } from 'nanoid'
import type { DownloadAnalysis, DownloadTrackItem, QualityInfo } from '#shared/domain/download'
import type { MetadataLayers } from '#shared/domain/track'
import { metadataTransformer } from '../../modules/metadata/metadata.service'
import { runCommand } from './command'
import { createProgressLineParser, type YtDlpProgressState } from './progress'
import { ytdlpCommandBuilder, buildCookieArgs } from './command-builder'
import { formatYtDlpError, isYoutubeAuthFailure } from './errors'
import { settingsService } from '../../modules/settings/settings.service'
import { sanitizeUrl, isYoutubePlaylistUrl } from '#shared/utils/url'

interface YtDlpEntry {
  id?: string
  title?: string
  artist?: string
  uploader?: string
  album?: string
  track?: string
  duration?: number
  webpage_url?: string
  url?: string
  extractor?: string
  abr?: number
  acodec?: string
  ext?: string
  entries?: YtDlpEntry[]
  _type?: string
  playlist_index?: number
  formats?: { acodec?: string, abr?: number, ext?: string, format_id?: string }[]
}

function bestQuality(entry: YtDlpEntry): QualityInfo {
  const audioFormats = (entry.formats || []).filter(f => f.acodec && f.acodec !== 'none')
  const best = audioFormats.sort((a, b) => (b.abr || 0) - (a.abr || 0))[0]
  const codec = best?.acodec || entry.acodec
  const bitrate = best?.abr || entry.abr
  const format = best?.ext || entry.ext
  const parts = [codec, bitrate ? `${bitrate}kbps` : null, format].filter(Boolean)
  return { codec, bitrate, format, label: parts.join(' · ') || 'Unknown' }
}

function entryToTrack(entry: YtDlpEntry, index: number): DownloadTrackItem {
  const title = entry.track || entry.title || `Track ${index + 1}`
  const artist = entry.artist || entry.uploader || 'Unknown Artist'
  const raw = {
    artist,
    album: entry.album,
    title,
    trackNumber: entry.playlist_index ?? index + 1
  }
  const layers: MetadataLayers = metadataTransformer.createLayersFromRaw(raw, entry.ext || 'm4a')

  const sourceUrl = entry.webpage_url || entry.url
    || (entry.id ? `https://www.youtube.com/watch?v=${entry.id}` : undefined)

  return {
    id: nanoid(),
    selected: true,
    sourceUrl,
    sourceQuality: bestQuality(entry),
    metadata: layers,
    order: index,
    progress: 0,
    status: 'waiting_confirmation'
  }
}

export class YtDlpAnalyzer {
  constructor(private readonly ytdlpPath: string) {}

  async analyze(url: string): Promise<DownloadAnalysis> {
    const cleanUrl = sanitizeUrl(url)
    const settings = settingsService.get()
    let args = ytdlpCommandBuilder.buildAnalyzeArgs(cleanUrl, settings)
    let result = await runCommand(this.ytdlpPath, args)

    // Cookies parfois invalides pour music.youtube.com alors que le téléchargement sans cookies fonctionne
    if (
      result.code !== 0
      && buildCookieArgs(settings).length > 0
      && isYoutubePlaylistUrl(cleanUrl)
      && isYoutubeAuthFailure(result.stderr)
    ) {
      args = ytdlpCommandBuilder.buildAnalyzeArgs(cleanUrl, settings, { skipCookies: true })
      const retry = await runCommand(this.ytdlpPath, args)
      if (retry.code === 0) result = retry
    }

    if (result.code !== 0) {
      throw createError({
        statusCode: 422,
        message: formatYtDlpError(result.stderr, 'Analyse yt-dlp échouée. yt-dlp est-il installé ?')
      })
    }

    let data: YtDlpEntry
    try {
      data = JSON.parse(result.stdout) as YtDlpEntry
    } catch {
      throw createError({ statusCode: 422, message: 'Invalid yt-dlp response' })
    }

    const rawEntries = data.entries?.length ? data.entries : [data]
    const entries = rawEntries.filter((e): e is YtDlpEntry => e != null && Boolean(e.id || e.title || e.url))
    const tracks = entries.map((e, i) => entryToTrack(e, i))

    return {
      url: cleanUrl,
      title: data.title,
      uploader: data.uploader,
      platform: data.extractor,
      sourceQuality: bestQuality(data),
      tracks
    }
  }
}

export class YtDlpExecutor {
  constructor(private readonly ytdlpPath: string) {}

  async download(
    args: string[],
    jobId: string,
    selectedTrackCount = 1,
    onProgress?: (state: YtDlpProgressState) => void
  ): Promise<CommandResult> {
    const handleChunk = createProgressLineParser(selectedTrackCount, onProgress)
    return runCommand(this.ytdlpPath, args, jobId, {
      onStderr: handleChunk,
      onStdout: handleChunk
    })
  }

  preview(args: string[]): string {
    return ytdlpCommandBuilder.preview(this.ytdlpPath, args)
  }
}

export function createYtDlpServices() {
  const config = useRuntimeConfig()
  const path = config.ytdlpPath || 'yt-dlp'
  return {
    analyzer: new YtDlpAnalyzer(path),
    executor: new YtDlpExecutor(path),
    ytdlpPath: path
  }
}
