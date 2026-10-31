import type { Artist } from '#shared/domain'
import type { Track } from '#shared/domain/track'
import { parseMetadataDate, pickReleaseDate, formatReleaseDate } from '#shared/utils/release-date'

const FEAT_IN_TITLE = /\s*(?:\(|\[)?\s*(?:feat\.?|ft\.?|featuring)\s+([^)\]]+)(?:\)|\])?/gi
const FEAT_IN_ARTIST = /^(.+?)\s+(?:feat\.?|ft\.?|featuring)\s+(.+)$/i

function splitNames(raw: string): string[] {
  if (!raw?.trim()) return []
  return raw.split(/\s*,\s*|\s*&\s*|\s+and\s+/i).map(s => s.trim()).filter(Boolean)
}

function isSameArtist(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

export function extractFeatsFromTitle(title: string): string[] {
  const feats: string[] = []
  let match: RegExpExecArray | null
  const re = new RegExp(FEAT_IN_TITLE.source, 'gi')
  while ((match = re.exec(title)) !== null) {
    splitNames(match[1]).forEach(n => feats.push(n))
  }
  return feats
}

export function extractFeatsFromArtistString(artist: string): { primary: string, feats: string[] } {
  const m = artist.match(FEAT_IN_ARTIST)
  if (!m) return { primary: artist.trim(), feats: [] }
  return { primary: m[1].trim(), feats: splitNames(m[2]) }
}

/** Collaborateurs = autres noms dans les métadonnées fichier / original (ex. « Alpha Wann, Infinit' »). */
function collaboratorsFromArtistField(field: string | undefined, primary: string): string[] {
  const out: string[] = []
  for (const name of splitNames(field || '')) {
    if (!isSameArtist(name, primary)) out.push(name)
  }
  return out
}

/** Lecture des métadonnées indexées — aucune transformation persistante. */
export function getTrackArtistsDisplay(track: Track): { primary: string, collaborators: string[] } {
  const libraryPrimary = track.metadata.library.artist
  const fileArtistRaw = track.metadata.file.artist?.trim()
  const primary = fileArtistRaw && !isSameArtist(fileArtistRaw, libraryPrimary)
    ? fileArtistRaw
    : libraryPrimary
  const collaborators = new Set<string>()

  collaboratorsFromArtistField(track.metadata.file.artist, primary).forEach(n => collaborators.add(n))
  collaboratorsFromArtistField(track.metadata.original.artist, primary).forEach(n => collaborators.add(n))

  extractFeatsFromTitle(track.metadata.original.title).forEach(f => {
    if (!isSameArtist(f, primary)) collaborators.add(f)
  })
  extractFeatsFromArtistString(track.metadata.file.artist).feats.forEach(f => {
    if (!isSameArtist(f, primary)) collaborators.add(f)
  })
  extractFeatsFromArtistString(track.metadata.original.artist).feats.forEach(f => {
    if (!isSameArtist(f, primary)) collaborators.add(f)
  })

  return { primary, collaborators: [...collaborators] }
}

/** @deprecated alias */
export function aggregateAlbumFeats(tracks: Track[], albumArtistName?: string): string[] {
  return aggregateAlbumCollaborators(tracks, albumArtistName)
}

export function aggregateAlbumCollaborators(tracks: Track[], albumArtistName?: string): string[] {
  const names = new Set<string>()
  for (const t of tracks) {
    for (const c of getTrackArtistsDisplay(t).collaborators) {
      if (albumArtistName && isSameArtist(c, albumArtistName)) continue
      names.add(c)
    }
  }
  return [...names]
}

export function resolveArtistByName(name: string, artists?: Artist[]): Artist | undefined {
  if (!artists?.length || !name.trim()) return undefined
  const needle = name.trim().toLowerCase()
  return artists.find(a =>
    a.name.toLowerCase() === needle || a.sortName.toLowerCase() === needle
  )
}

export function trackArtistsSortLabel(track: Track): string {
  const { primary, collaborators } = getTrackArtistsDisplay(track)
  return collaborators.length ? `${primary}, ${collaborators.join(', ')}` : primary
}

export function releaseYearFromTracks(tracks: Track[], albumYear?: number): number | undefined {
  const label = releaseDateFromTracks(tracks, albumYear)
  if (!label) return undefined
  const match = label.match(/\d{4}/)
  return match ? Number(match[0]) : undefined
}

export function releaseDateFromTracks(tracks: Track[], albumYear?: number): string | undefined {
  const candidates = []
  if (albumYear) candidates.push(parseMetadataDate(albumYear))
  for (const t of tracks) {
    for (const layer of [t.metadata.library, t.metadata.file, t.metadata.original]) {
      candidates.push(parseMetadataDate(layer.date))
      if (layer.year) candidates.push(parseMetadataDate(layer.year))
    }
  }
  const picked = pickReleaseDate(candidates)
  return picked ? formatReleaseDate(picked) : undefined
}
