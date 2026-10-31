import { initDb } from '../infrastructure/db/client'
import { migrateFromJsonIfNeeded, seedDefaultsIfEmpty } from '../infrastructure/db/migrate-from-json'
import { migrateProfilesToSettingsIfNeeded } from '../infrastructure/db/migrate-profiles-to-settings'
import { getAppConfigDir, getMusicLibraryPath, ensureDir, getLogsDir } from '../infrastructure/paths/data-dir'
import { downloadService } from '../modules/download/download.service'

export default defineNitroPlugin(async () => {
  const config = useRuntimeConfig()
  const configDir = config.luzDataDir || getAppConfigDir()
  await ensureDir(configDir)
  await ensureDir(getLogsDir(configDir))
  await ensureDir(getMusicLibraryPath())

  initDb(configDir)
  await migrateFromJsonIfNeeded()
  seedDefaultsIfEmpty()
  migrateProfilesToSettingsIfNeeded()
  downloadService.resumeQueue()
})
