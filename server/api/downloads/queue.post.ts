import { z } from 'zod'
import { downloadService } from '../../modules/download/download.service'

const destinationSchema = z.object({
  type: z.enum(['root', 'artist', 'album', 'singles', 'playlist']),
  artistId: z.string().optional(),
  albumId: z.string().optional(),
  playlistId: z.string().optional()
})

const bodySchema = z.object({
  url: z.string(),
  tracks: z.array(z.any()),
  options: z.object({
    format: z.string(),
    quality: z.string(),
    embedCover: z.boolean(),
    writeMetadata: z.boolean(),
    featStrategy: z.enum(['metadata_only', 'title_and_metadata', 'title_only']).optional(),
    destinationMode: z.enum(['auto', 'library', 'playlist']).optional()
  }),
  destinationContext: destinationSchema,
  outputTemplate: z.string().optional(),
  customArgs: z.array(z.string()).optional(),
  sourceTitle: z.string().optional()
})

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const parsed = bodySchema.parse(body)
  return downloadService.enqueue(parsed)
})
