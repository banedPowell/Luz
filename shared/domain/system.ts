export interface ScanState {
  running: boolean
  progress: number
  filesFound: number
  filesProcessed: number
  errors: string[]
  startedAt?: string
  finishedAt?: string
}

export const DEFAULT_SCAN_STATE: ScanState = {
  running: false,
  progress: 0,
  filesFound: 0,
  filesProcessed: 0,
  errors: []
}

export interface SystemDiagnostics {
  ytdlp: { available: boolean, version?: string, path: string }
  ffmpeg: { available: boolean, version?: string, path: string }
  exiftool: { available: boolean, version?: string, path: string }
  disk: { free: number, total: number }
  library: {
    artists: number
    albums: number
    tracks: number
    playlists: number
    sizeOnDisk: number
  }
  cache: { entries: number, size: number }
  dataDir: string
  libraryPath: string
  lastScanAt?: string
  errors: string[]
}
