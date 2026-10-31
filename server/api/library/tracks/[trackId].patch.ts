import { z } from 'zod'
import { libraryService } from '#server/modules/library/library.service'
import { metadataService } from '#server/modules/metadata/metadata.service'
import type { TrackMetadata } from '#shared/domain/track'

const optionalNumber = z.preprocess((v) => {
  if (v === '' || v === null || v === undefined) return undefined
  if (typeof v === 'number' && Number.isNaN(v)) return undefined
  const n = Number(v)
  return Number.isNaN(n) ? undefined : n
}, z.number().optional())

const librarySchema = z.object({
  artist: z.string().optional(),
  album: z.string().optional(),
  title: z.string().optional(),
  trackNumber: optionalNumber,
  discNumber: optionalNumber,
  genre: z.string().optional(),
  year: optionalNumber,
  comment: z.string().optional()
})

const bodySchema = z.object({
  metadata: z.object({
    library: librarySchema.optional()
  }).passthrough().optional()
}).passthrough()

export default defineEventHandler(async (event) => {
  const trackId = getRouterParam(event, 'trackId')!
  const body = await readBody(event)
  const parsed = bodySchema.parse(body)
  const track = libraryService.getTrack(trackId)

  if (!parsed.metadata?.library) {
    return track
  }

  const incoming = parsed.metadata.library
  const { trackNumber: incomingTrackNumber, ...tagFields } = incoming
  const merged = { ...track.metadata.library, ...incoming }
  track.metadata.library = merged

  let tagWarning: string | undefined

  if (track.file.path) {
    try {
      if (Object.keys(tagFields).length > 0) {
        const metaForTags: TrackMetadata = { ...track.metadata.file, ...tagFields }
        delete metaForTags.trackNumber
        await metadataService.writeTags(track.file.path, metaForTags)
      }

      if (incomingTrackNumber != null) {
        await metadataService.writeTrackNumberToFile(track.file.path, incomingTrackNumber)
      }

      const fromDisk = await metadataService.readTrackNumberFromFile(track.file.path)
      const fromTags = await metadataService.readTags(track.file.path)

      if (fromTags) {
        track.metadata.file = { ...fromTags, trackNumber: fromDisk ?? fromTags.trackNumber }
      }
      if (fromDisk != null) {
        track.metadata.original = { ...track.metadata.original, trackNumber: fromDisk }
        track.metadata.library = { ...merged, trackNumber: fromDisk }
      } else if (fromTags?.trackNumber != null) {
        track.metadata.library = { ...merged, trackNumber: fromTags.trackNumber }
      }
    } catch (err) {
      tagWarning = err instanceof Error ? err.message : 'Échec écriture tags fichier'
    }
  } else {
    track.metadata.file = { ...track.metadata.file, ...merged }
  }

  const updated = libraryService.updateTrack(trackId, track)
  if (tagWarning) {
    return { ...updated, _warning: tagWarning }
  }
  return updated
})
