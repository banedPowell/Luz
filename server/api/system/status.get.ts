import { systemService } from '../../modules/system/system.service'

export default defineEventHandler(async () => {
  return systemService.getDiagnostics()
})
