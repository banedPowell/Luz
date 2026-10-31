export interface YtDlpProgressState {
  jobPercent: number
  currentItem?: number
  totalItems?: number
  itemPercent?: number
}

const ITEM_RE = /(?:Downloading|Extracting)\s+(?:item|video|audio)\s+(\d+)\s+of\s+(\d+)/i
const PCT_RES = [
  /\[download\]\s*(\d+(?:\.\d+)?)\s*%/i,
  /\[ExtractAudio\]\s*(\d+(?:\.\d+)?)\s*%/i,
  /\[ffmpeg\][^\n]*?(\d+(?:\.\d+)?)\s*%/i,
  /\[Merger\][^\n]*?(\d+(?:\.\d+)?)\s*%/i,
  /\[Fixup\w*\][^\n]*?(\d+(?:\.\d+)?)\s*%/i,
  /(\d+(?:\.\d+)?)\s*%\s+of\s+/i,
  /download:luz:(\d+(?:\.\d+)?)/i
]

function parsePercent(line: string): number | undefined {
  for (const re of PCT_RES) {
    const m = line.match(re)
    if (m) return parseFloat(m[1])
  }
  return undefined
}

function computeJobPercent(
  currentItem: number,
  totalItems: number,
  itemPercent: number
): number {
  return Math.min(99, Math.round((((currentItem - 1) / totalItems) * 100 + (itemPercent / totalItems)) * 10) / 10)
}

/** Parse une ligne de progression yt-dlp (stderr/stdout, avec ou sans TTY). */
export function parseYtDlpProgress(line: string, selectedTrackCount = 1): YtDlpProgressState | null {
  const trimmed = line.trim()
  if (!trimmed) return null

  let currentItem: number | undefined
  let totalItems: number | undefined

  const itemMatch = trimmed.match(ITEM_RE)
  if (itemMatch) {
    currentItem = parseInt(itemMatch[1], 10)
    totalItems = parseInt(itemMatch[2], 10)
  }

  const itemPercent = parsePercent(trimmed)
  const total = totalItems ?? selectedTrackCount

  if (itemPercent != null && total > 0 && currentItem != null) {
    return {
      jobPercent: computeJobPercent(currentItem, total, itemPercent),
      currentItem,
      totalItems: total,
      itemPercent
    }
  }

  if (itemPercent != null) {
    return { jobPercent: Math.min(99, itemPercent), itemPercent, totalItems: total }
  }

  if (currentItem != null) {
    return { jobPercent: Math.min(99, ((currentItem - 1) / total) * 100), currentItem, totalItems: total }
  }

  return null
}

export function createProgressLineParser(
  selectedTrackCount: number,
  onProgress?: (state: YtDlpProgressState) => void
): (chunk: string) => void {
  let buffer = ''
  let lastCurrentItem: number | undefined
  let lastTotalItems: number | undefined

  return (chunk: string) => {
    buffer += chunk.replace(/\r/g, '\n')
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''
    for (const line of lines) {
      const parsed = parseYtDlpProgress(line, selectedTrackCount)
      if (!parsed) continue

      if (parsed.currentItem != null) lastCurrentItem = parsed.currentItem
      if (parsed.totalItems != null) lastTotalItems = parsed.totalItems

      const currentItem = parsed.currentItem ?? lastCurrentItem
      const totalItems = parsed.totalItems ?? lastTotalItems ?? selectedTrackCount
      const itemPercent = parsed.itemPercent

      let state: YtDlpProgressState = { ...parsed, currentItem, totalItems }

      if (itemPercent != null && currentItem != null && totalItems > 0) {
        state = {
          jobPercent: computeJobPercent(currentItem, totalItems, itemPercent),
          currentItem,
          totalItems,
          itemPercent
        }
      } else if (itemPercent != null && currentItem == null && selectedTrackCount === 1) {
        state = { jobPercent: Math.min(99, itemPercent), itemPercent, totalItems: 1 }
      } else if (currentItem != null && totalItems > 0) {
        state = {
          jobPercent: Math.min(99, ((currentItem - 1) / totalItems) * 100),
          currentItem,
          totalItems
        }
      }

      onProgress?.(state)
    }
  }
}

export function parseProgressFromChunk(chunk: string): number | null {
  const state = parseYtDlpProgress(chunk)
  return state ? state.jobPercent : null
}
