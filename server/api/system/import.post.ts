import { writeFile, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { systemService } from '../../modules/system/system.service'

export default defineEventHandler(async (event) => {
  const form = await readMultipartFormData(event)
  const file = form?.find(f => f.name === 'file' && f.data)
  if (!file?.data) {
    throw createError({ statusCode: 400, message: 'Fichier requis (luz.db ou archive)' })
  }

  const tmp = join(tmpdir(), `luz-import-${Date.now()}-${file.filename || 'db'}`)
  await writeFile(tmp, file.data)

  try {
    if (file.filename?.endsWith('.zip')) {
      const extractDir = join(tmpdir(), `luz-import-dir-${Date.now()}`)
      const { mkdir, cp } = await import('node:fs/promises')
      await mkdir(extractDir, { recursive: true })
      const { execFile } = await import('node:child_process')
      const { promisify } = await import('node:util')
      const exec = promisify(execFile)
      try {
        await exec('tar', ['-xf', tmp, '-C', extractDir])
      } catch {
        await exec('powershell', ['-Command', `Expand-Archive -Path '${tmp}' -DestinationPath '${extractDir}' -Force`])
      }
      await systemService.importDirectory(extractDir)
      await import('node:fs/promises').then(fs => fs.rm(extractDir, { recursive: true, force: true }))
    } else {
      await systemService.importDbFile(tmp)
    }
    return { success: true, message: 'Import terminé — redémarrez l\'application si nécessaire' }
  } finally {
    await unlink(tmp).catch(() => {})
  }
})
