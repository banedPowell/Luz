import { z } from 'zod'
import { playlistService } from '#server/modules/playlist/playlist.service'

const bodySchema = z.object({ otherId: z.string() })

export default defineEventHandler(async (event) => {
  const playlistId = getRouterParam(event, 'playlistId')!
  const body = await readBody(event)
  const { otherId } = bodySchema.parse(body)
  return playlistService.merge(playlistId, otherId)
})
