import { getMusicLibraryPath } from '../paths/data-dir'
import { createDefaultSettings, type AppSettings } from '#shared/domain/settings'

export function getDefaultSettings(): AppSettings {
  return createDefaultSettings(getMusicLibraryPath())
}
