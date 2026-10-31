import { z } from 'zod'
import { libraryService } from '#server/modules/library/library.service'

const bodySchema = z.object({
  title: z.string().optional(),
  type: z.enum(['album', 'single']).optional(),
  year: z.number().optional(),
  genre: z.string().optional()
})

export default defineEventHandler(async (event) => {
  const albumId = getRouterParam(event, 'albumId')!
  const parsed = bodySchema.parse(await readBody(event))
  return libraryService.updateAlbum(albumId, parsed)
})
