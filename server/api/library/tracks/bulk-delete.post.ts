import { z } from 'zod'
import { libraryService } from '#server/modules/library/library.service'

const bodySchema = z.object({ ids: z.array(z.string()).min(1) })

export default defineEventHandler(async (event) => {
  const { ids } = bodySchema.parse(await readBody(event))
  const count = await libraryService.bulkDeleteTracks(ids)
  return { success: true, count }
})
