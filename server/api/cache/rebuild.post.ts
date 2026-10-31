import { cacheService } from '../../modules/cache/cache.service'

export default defineEventHandler(async () => {
  const count = await cacheService.rebuild()
  return { count }
})
