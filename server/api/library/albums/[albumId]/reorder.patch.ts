import { z } from 'zod'
import { libraryService } from '#server/modules/library/library.service'

const bodySchema = z.object({ trackIds: z.array(z.string()) })

export default defineEventHandler(async (event) => {
  const albumId = getRouterParam(event, 'albumId')!
  const body = await readBody(event)
  const { trackIds } = bodySchema.parse(body)
  return await libraryService.reorderTracks(albumId, trackIds)
})
