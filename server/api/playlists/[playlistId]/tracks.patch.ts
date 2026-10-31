import { z } from 'zod'
import { playlistService } from '#server/modules/playlist/playlist.service'

const bodySchema = z.object({ trackIds: z.array(z.string()) })

export default defineEventHandler(async (event) => {
  const playlistId = getRouterParam(event, 'playlistId')!
  const body = await readBody(event)
  const { trackIds } = bodySchema.parse(body)
  return await playlistService.reorder(playlistId, trackIds)
})
