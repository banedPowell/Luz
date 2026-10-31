import { libraryService } from '#server/modules/library/library.service'

export default defineEventHandler(async (event) => {
  const trackId = getRouterParam(event, 'trackId')
  if (!trackId) throw createError({ statusCode: 400 })
  await libraryService.deleteTrack(trackId, true)
  return { success: true }
})
