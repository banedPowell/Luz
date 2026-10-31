export const DOWNLOAD_STATUSES = [
  'queued',
  'analysing',
  'waiting_confirmation',
  'downloading',
  'converting',
  'moving',
  'updating_library',
  'finished',
  'cancelled',
  'failed'
] as const

export type DownloadStatus = typeof DOWNLOAD_STATUSES[number]

export const DOWNLOAD_STEPS = [
  'analyse',
  'download',
  'convert',
  'move',
  'index',
  'done'
] as const

export type DownloadStep = typeof DOWNLOAD_STEPS[number]
