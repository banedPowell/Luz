import { playlistService } from '../../modules/playlist/playlist.service'

export default defineEventHandler(async (event) => {
  const playlistId = getRouterParam(event, 'playlistId')!
  await playlistService.delete(playlistId)
  return { success: true }
})
