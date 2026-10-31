import { settingsService } from '#server/modules/settings/settings.service'

export default defineEventHandler(async () => {
  return settingsService.get()
})
