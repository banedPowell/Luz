import type { TrackDetails, DetailRow } from '#shared/domain/track-details'
import { libraryService } from '../library/library.service'
import { ffprobeService } from '../../infrastructure/ffmpeg/ffprobe.service'
import { metadataService } from '../metadata/metadata.service'
import { releaseDateLabelFromRaw } from '#shared/utils/release-date'

const CREDIT_KEYS = new Set([
  'artist', 'album', 'album_artist', 'title', 'composer', 'writer', 'performer',
  'conductor', 'genre', 'date', 'copyright', 'label', 'comment'
])

function formatDuration(seconds?: number): string | undefined {
  if (!seconds) return undefined
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

function formatSize(bytes?: number): string | undefined {
  if (!bytes) return undefined
  return `${(bytes / 1024 / 1024).toFixed(2)} Mo`
}

export async function buildTrackDetails(trackId: string): Promise<TrackDetails> {
  const track = libraryService.getTrack(trackId)
  const tags = await metadataService.readTags(track.file.path)
  const probe = await ffprobeService.probeFile(track.file.path).catch(() => null)

  const credits: DetailRow[] = []
  const push = (arr: DetailRow[], label: string, value?: string | number) => {
    if (value != null && String(value).trim()) arr.push({ label, value: String(value) })
  }

  push(credits, 'Artiste', track.metadata.library.artist)
  push(credits, 'Album', track.metadata.library.album)
  push(credits, 'Titre', track.metadata.library.title)
  push(credits, 'Artiste (fichier)', track.metadata.file.artist)
  push(credits, 'Genre', track.metadata.library.genre)
  const releaseDate = releaseDateLabelFromRaw(
    track.metadata.library.date,
    track.metadata.file.date,
    track.metadata.original.date,
    tags?.date,
    track.metadata.library.year,
    tags?.year,
    probe?.tags?.date
  )
  push(credits, 'Date de sortie', releaseDate)
  const fileTrackNumber = await metadataService.readTrackNumberFromFile(track.file.path)
  credits.push({
    label: 'N° (fichier)',
    value: fileTrackNumber != null ? String(fileTrackNumber) : '—'
  })

  if (probe?.tags) {
    for (const [k, v] of Object.entries(probe.tags)) {
      if (k === 'date' && releaseDate) continue
      if (CREDIT_KEYS.has(k) && !credits.find(c => c.label.toLowerCase() === k)) {
        push(credits, k.replace(/_/g, ' '), v)
      }
    }
  }

  const technical: DetailRow[] = []
  push(technical, 'Codec', probe?.codec || track.file.codec)
  push(technical, 'Bitrate', probe?.bitrate ? `${probe.bitrate} kbps` : track.file.bitrate ? `${track.file.bitrate} kbps` : undefined)
  push(technical, 'Durée', formatDuration(probe?.duration ?? track.file.duration))
  push(technical, 'Sample rate', probe?.sampleRate ? `${probe.sampleRate} Hz` : undefined)
  push(technical, 'Canaux', probe?.channels)
  push(technical, 'Format', probe?.formatName || track.file.format?.toUpperCase())
  push(technical, 'Encodeur', probe?.encoder)

  const file: DetailRow[] = []
  push(file, 'Chemin', track.file.path)
  push(file, 'Taille', formatSize(track.file.size))
  push(file, 'Extension', track.file.format)

  const source: DetailRow[] = []
  if (track.source?.url) push(source, 'URL source', track.source.url)
  if (track.source?.downloadedAt) push(source, 'Téléchargé le', track.source.downloadedAt)

  const known = new Set([...CREDIT_KEYS, 'encoder', 'creation_time'])
  const other: DetailRow[] = []
  if (probe?.tags) {
    for (const [k, v] of Object.entries(probe.tags)) {
      if (!known.has(k) && v.trim()) {
        push(other, k.replace(/_/g, ' '), v)
      }
    }
  }
  if (tags?.comment && !credits.find(c => c.label === 'Commentaire')) {
    push(other, 'Commentaire', tags.comment)
  }

  return { credits, technical, file, source, other }
}
