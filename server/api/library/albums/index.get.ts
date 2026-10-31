import { libraryService } from '#server/modules/library/library.service'

export default defineEventHandler(async () => {
  return libraryService.getAlbums()
})
