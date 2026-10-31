import { libraryService } from '#server/modules/library/library.service'

export default defineEventHandler(async (event) => {
  const albumId = getRouterParam(event, 'albumId')!
  await libraryService.deleteAlbum(albumId)
  return { success: true }
})
