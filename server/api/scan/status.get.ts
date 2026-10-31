import { scanService } from '../../modules/scan/scan.service'

export default defineEventHandler(async () => {
  return scanService.getStatus()
})
