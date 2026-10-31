import { runCommand } from '../ytdlp/command'

export interface FfprobeResult {
  codec?: string
  bitrate?: number
  duration?: number
  sampleRate?: number
  channels?: number
  formatName?: string
  encoder?: string
  tags: Record<string, string>
}

function ffprobePath(): string {
  const config = useRuntimeConfig()
  const ffmpeg = config.ffmpegPath || 'ffmpeg'
  return ffmpeg.replace(/ffmpeg(\.exe)?$/i, 'ffprobe$1')
}

export class FfprobeService {
  async probeFile(filePath: string): Promise<FfprobeResult> {
    const path = ffprobePath()
    const result = await runCommand(path, [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      filePath
    ])
    if (result.code !== 0) throw new Error(result.stderr || 'ffprobe failed')

    const data = JSON.parse(result.stdout) as {
      format?: { duration?: string, bit_rate?: string, format_long_name?: string, tags?: Record<string, string> }
      streams?: { codec_type?: string, codec_name?: string, bit_rate?: string, sample_rate?: string, channels?: number }[]
    }

    const audio = data.streams?.find(s => s.codec_type === 'audio')
    const tags: Record<string, string> = {}
    for (const [k, v] of Object.entries(data.format?.tags || {})) {
      tags[k.toLowerCase()] = String(v)
    }

    return {
      codec: audio?.codec_name,
      bitrate: audio?.bit_rate ? Math.round(parseInt(audio.bit_rate, 10) / 1000) : undefined,
      duration: data.format?.duration ? parseFloat(data.format.duration) : undefined,
      sampleRate: audio?.sample_rate ? parseInt(audio.sample_rate, 10) : undefined,
      channels: audio?.channels,
      formatName: data.format?.format_long_name,
      encoder: tags.encoder,
      tags
    }
  }
}

export const ffprobeService = new FfprobeService()
