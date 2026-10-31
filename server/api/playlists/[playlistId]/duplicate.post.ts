import { playlistService } from '#server/modules/playlist/playlist.service'

export default defineEventHandler(async (event) => {
  const playlistId = getRouterParam(event, 'playlistId')!
  return playlistService.duplicate(playlistId)
})
