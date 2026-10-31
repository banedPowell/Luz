import { createReadStream } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { sendStream } from 'h3'
import { systemService } from '../../modules/system/system.service'

export default defineEventHandler(async (event) => {
  const dest = join(tmpdir(), `luz-export-${Date.now()}.zip`)
  await systemService.exportData(dest)
  setResponseHeader(event, 'Content-Disposition', 'attachment; filename="luz-backup.zip"')
  return sendStream(event, createReadStream(dest))
})
