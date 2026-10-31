import { eq } from 'drizzle-orm'
import { getDb } from '../../infrastructure/db/client'
import * as schema from '../../infrastructure/db/schema'
import type { AppSettings } from '#shared/domain/settings'
import { DEFAULT_SETTINGS } from '#shared/domain/settings'

export class SettingsRepository {
  get(): AppSettings {
    const db = getDb()
    const row = db.select().from(schema.settings).limit(1).all()[0]
    return row?.data ?? DEFAULT_SETTINGS
  }

  save(settings: AppSettings): AppSettings {
    const db = getDb()
    const existing = db.select().from(schema.settings).limit(1).all()[0]
    if (existing) {
      db.update(schema.settings).set({ data: settings }).where(eq(schema.settings.id, existing.id)).run()
    } else {
      db.insert(schema.settings).values({ data: settings }).run()
    }
    return settings
  }

  update(fn: (s: AppSettings) => AppSettings): AppSettings {
    const current = this.get()
    return this.save(fn(current))
  }
}

export const settingsRepository = new SettingsRepository()
