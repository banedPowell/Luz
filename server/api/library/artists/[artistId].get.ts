import { libraryService } from '#server/modules/library/library.service'

export default defineEventHandler(async (event) => {
  const artistId = getRouterParam(event, 'artistId')!
  return libraryService.getArtist(artistId)
})
