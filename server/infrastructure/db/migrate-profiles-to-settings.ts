import { eq } from 'drizzle-orm'
import type { AppSettings } from '#shared/domain/settings'
import { createDefaultSettings } from '#shared/domain/settings'
import type { DeviceProfile } from '#shared/domain/device-profile'
import { getDb } from './client'
import * as schema from './schema'
import { getMusicLibraryPath } from '../paths/data-dir'

function profileToSettings(profile: DeviceProfile, existing?: AppSettings): AppSettings {
  const base = createDefaultSettings(profile.storagePath || getMusicLibraryPath())
  return {
    ...base,
    ...existing,
    libraryPath: profile.storagePath || base.libraryPath,
    downloadDefaults: profile.downloadDefaults || base.downloadDefaults,
    metadataRules: {
      featStrategy: profile.metadataRules?.featStrategy || base.metadataRules.featStrategy
    },
    supportedFormats: profile.capabilities?.supportedFormats || base.supportedFormats,
    outputTemplate: existing?.outputTemplate || `${profile.storagePath}/%(artist|uploader)s/%(album|Singles)s/%(title)s.%(ext)s`
  }
}

export function migrateProfilesToSettingsIfNeeded(): void {
  const db = getDb()
  const settingsRow = db.select().from(schema.settings).limit(1).get()
  const current = settingsRow?.data as AppSettings | undefined

  if (current?.libraryPath && current.downloadDefaults) return

  const activeState = db.select().from(schema.profileState).limit(1).get()
  const activeId = activeState?.activeProfileId
  let profile: DeviceProfile | undefined

  if (activeId) {
    const row = db.select().from(schema.profiles).where(eq(schema.profiles.id, activeId)).get()
    profile = row?.data
  }
  if (!profile) {
    const first = db.select().from(schema.profiles).limit(1).get()
    profile = first?.data
  }

  const merged = profile
    ? profileToSettings(profile, current)
    : createDefaultSettings(getMusicLibraryPath())

  if (settingsRow) {
    db.update(schema.settings).set({ data: merged }).where(eq(schema.settings.id, settingsRow.id)).run()
  } else {
    db.insert(schema.settings).values({ data: merged }).run()
  }
}
