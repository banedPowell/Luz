import { buildTrackDetails } from '#server/modules/library/track-details.service'

export default defineEventHandler(async (event) => {
  const trackId = getRouterParam(event, 'trackId')
  if (!trackId) throw createError({ statusCode: 400, message: 'trackId required' })
  return buildTrackDetails(trackId)
})
