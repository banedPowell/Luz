import { z } from 'zod'
import { libraryService } from '#server/modules/library/library.service'

const bodySchema = z.object({ name: z.string().min(1) })

export default defineEventHandler(async (event) => {
  const artistId = getRouterParam(event, 'artistId')!
  const { name } = bodySchema.parse(await readBody(event))
  return libraryService.updateArtist(artistId, { name })
})
