import { z } from 'zod'
import { downloadService } from '../../modules/download/download.service'

const bodySchema = z.object({ url: z.string().url() })

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { url } = bodySchema.parse(body)
  return downloadService.analyze(url)
})
