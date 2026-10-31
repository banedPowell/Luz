import { z } from 'zod'
import { cacheService } from '../../modules/cache/cache.service'

const bodySchema = z.object({
  tracks: z.array(z.object({
    metadata: z.object({ library: z.object({ artist: z.string(), title: z.string() }) }),
    sourceUrl: z.string().optional()
  }))
})

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { tracks } = bodySchema.parse(body)
  return cacheService.check(tracks)
})
