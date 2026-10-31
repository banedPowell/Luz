import { getJobLogs } from '../../../infrastructure/logger/job-logger'

export default defineEventHandler((event) => {
  const jobId = getRouterParam(event, 'jobId')
  if (!jobId) throw createError({ statusCode: 400, message: 'jobId required' })
  return getJobLogs(jobId)
})
