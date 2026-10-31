import { systemService } from '#server/modules/system/system.service'

export default defineEventHandler(async (event) => {
  const action = getRouterParam(event, 'action')!
  return systemService.runAction(action)
})
