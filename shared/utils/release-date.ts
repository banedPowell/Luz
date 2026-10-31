export type DatePrecision = 'day' | 'month' | 'year'

export interface ParsedReleaseDate {
  raw: string
  precision: DatePrecision
  sortKey: string
}

export function parseMetadataDate(raw?: string | number | null): ParsedReleaseDate | null {
  if (raw == null || raw === '') return null
  const s = String(raw).trim()

  const compact = s.match(/^(\d{4})(\d{2})(\d{2})$/)
  if (compact) {
    const [, y, mo, d] = compact
    return { raw: s, precision: 'day', sortKey: `${y}-${mo}-${d}` }
  }

  const iso = s.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?/)
  if (iso) {
    const [, y, mo, d] = iso
    if (d) return { raw: s, precision: 'day', sortKey: `${y}-${mo}-${d}` }
    return { raw: s, precision: 'month', sortKey: `${y}-${mo}-01` }
  }

  if (/^\d{4}$/.test(s)) {
    return { raw: s, precision: 'year', sortKey: `${s}-01-01` }
  }

  const parsed = new Date(s)
  if (!Number.isNaN(parsed.getTime())) {
    const y = parsed.getFullYear()
    const mo = String(parsed.getMonth() + 1).padStart(2, '0')
    const d = String(parsed.getDate()).padStart(2, '0')
    return { raw: s, precision: 'day', sortKey: `${y}-${mo}-${d}` }
  }

  return null
}

export function formatReleaseDate(parsed: ParsedReleaseDate): string {
  const [y, mo, day] = parsed.sortKey.split('-').map(Number)
  const date = new Date(y, mo - 1, day || 1)

  if (parsed.precision === 'year') {
    return String(y)
  }
  if (parsed.precision === 'month') {
    return new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(date)
  }
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }).format(date)
}

/** Préfère la date la plus précise ; à précision égale, la plus ancienne. */
export function pickReleaseDate(candidates: (ParsedReleaseDate | null | undefined)[]): ParsedReleaseDate | null {
  const valid = candidates.filter((c): c is ParsedReleaseDate => !!c)
  if (!valid.length) return null

  const precisionRank: Record<DatePrecision, number> = { day: 0, month: 1, year: 2 }
  valid.sort((a, b) => {
    const byPrecision = precisionRank[a.precision] - precisionRank[b.precision]
    if (byPrecision !== 0) return byPrecision
    return a.sortKey.localeCompare(b.sortKey)
  })
  return valid[0]
}

export function releaseDateLabelFromRaw(...values: (string | number | undefined | null)[]): string | undefined {
  const picked = pickReleaseDate(values.map(v => parseMetadataDate(v)))
  return picked ? formatReleaseDate(picked) : undefined
}
