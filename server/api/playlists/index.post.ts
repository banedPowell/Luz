import { z } from 'zod'
import { playlistService } from '../../modules/playlist/playlist.service'

const bodySchema = z.object({
  name: z.string(),
  description: z.string().optional()
})

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { name, description } = bodySchema.parse(body)
  return playlistService.create(name, description)
})
