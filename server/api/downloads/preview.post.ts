import { downloadService } from '../../modules/download/download.service'
import type { DownloadOptions, DestinationContext } from '#shared/domain/download'

export default defineEventHandler(async (event) => {
  const body = await readBody<{
    url: string
    options: DownloadOptions
    destinationContext: DestinationContext
    outputTemplate?: string
    customArgs?: string[]
    sourceTitle?: string
    trackCount?: number
  }>(event)

  if (!body?.url) {
    throw createError({ statusCode: 400, message: 'url required' })
  }

  return {
    command: await downloadService.previewCommand(body)
  }
})
