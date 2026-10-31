import type { AppSettings } from '#shared/domain/settings'
import { settingsRepository } from './settings.repository'

export class SettingsService {
  get() {
    return settingsRepository.get()
  }

  async update(partial: Partial<AppSettings>): Promise<AppSettings> {
    return settingsRepository.update((current) => ({
      ...current,
      ...partial
    }))
  }
}

export const settingsService = new SettingsService()
