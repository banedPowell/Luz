import { z } from 'zod'
import { playlistService } from '../../modules/playlist/playlist.service'

const bodySchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  trackIds: z.array(z.string()).optional()
})

export default defineEventHandler(async (event) => {
  const playlistId = getRouterParam(event, 'playlistId')!
  const body = await readBody(event)
  const parsed = bodySchema.parse(body)
  return playlistService.update(playlistId, parsed)
})
