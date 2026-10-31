import { downloadService } from '../../modules/download/download.service'

export default defineEventHandler(async () => {
  return downloadService.getQueue()
})
