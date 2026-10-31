import { downloadService } from '../../../modules/download/download.service'

export default defineEventHandler(async (event) => {
  const jobId = getRouterParam(event, 'jobId')
  if (!jobId) throw createError({ statusCode: 400, message: 'jobId required' })
  await downloadService.dismiss(jobId)
  return { success: true }
})
