import { libraryService } from '#server/modules/library/library.service'

export default defineEventHandler(async (event) => {
  const albumId = getRouterParam(event, 'albumId')!
  const album = libraryService.getAlbum(albumId)
  const releaseDate = await libraryService.resolveAlbumReleaseDate(albumId)
  return { ...album, releaseDate }
})
