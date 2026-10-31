import { playlistService } from '../../modules/playlist/playlist.service'

export default defineEventHandler(async () => {
  return playlistService.getAll()
})
