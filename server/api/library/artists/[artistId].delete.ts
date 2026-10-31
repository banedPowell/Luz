import { libraryService } from '#server/modules/library/library.service'

export default defineEventHandler(async (event) => {
  const artistId = getRouterParam(event, 'artistId')!
  await libraryService.deleteArtist(artistId)
  return { success: true }
})
