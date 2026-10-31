export function formatBytes(bytes?: number): string {
  if (!bytes) return '—'
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} Go`
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} Mo`
  return `${(bytes / 1024).toFixed(0)} Ko`
}

export function sumTrackSizes(tracks: { file?: { size?: number } }[]): number {
  return tracks.reduce((sum, t) => sum + (t.file?.size || 0), 0)
}

export function sumTrackDurations(tracks: { file?: { duration?: number } }[]): number {
  return tracks.reduce((sum, t) => sum + (t.file?.duration || 0), 0)
}

export function formatDuration(seconds?: number): string {
  if (!seconds) return '—'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

export function formatDurationTotal(seconds: number): string {
  if (!seconds) return '—'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return `${h} h ${m.toString().padStart(2, '0')} min`
  return `${m} min ${s.toString().padStart(2, '0')} s`
}
