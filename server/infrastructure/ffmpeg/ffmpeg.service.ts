import { checkBinary, runCommand } from '../ytdlp/command'

export class FfmpegService {
  constructor(private readonly ffmpegPath: string) {}

  async probe(): Promise<{ available: boolean, version?: string }> {
    return checkBinary(this.ffmpegPath)
  }

  async convert(input: string, output: string, codec: string): Promise<void> {
    const result = await runCommand(this.ffmpegPath, [
      '-i', input,
      '-codec:a', codec,
      '-y',
      output
    ])
    if (result.code !== 0) throw new Error(result.stderr || 'FFmpeg conversion failed')
  }
}

export function createFfmpegService() {
  const config = useRuntimeConfig()
  return new FfmpegService(config.ffmpegPath || 'ffmpeg')
}
