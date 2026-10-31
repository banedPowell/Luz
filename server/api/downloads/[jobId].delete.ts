import { downloadService } from '../../modules/download/download.service'

export default defineEventHandler(async (event) => {
  const jobId = getRouterParam(event, 'jobId')!
  await downloadService.cancel(jobId)
  return { success: true }
})
