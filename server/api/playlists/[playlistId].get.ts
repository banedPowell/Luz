import { playlistService } from '../../modules/playlist/playlist.service'

export default defineEventHandler(async (event) => {
  const playlistId = getRouterParam(event, 'playlistId')!
  return playlistService.getById(playlistId)
})
