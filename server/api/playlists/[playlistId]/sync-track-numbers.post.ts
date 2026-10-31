import { libraryService } from '#server/modules/library/library.service'

export default defineEventHandler(async (event) => {
  const playlistId = getRouterParam(event, 'playlistId')!
  const playlist = libraryService.getPlaylist(playlistId)
  const synced = await libraryService.syncTrackNumbersFromFiles(playlist.trackIds)
  return { success: true, synced }
})
