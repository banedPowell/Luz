import {
  youtubeCookiesService,
  getYoutubeCookiesPath,
  readYoutubeCookies,
  previewYoutubeCookies
} from '#server/modules/settings/youtube-cookies.service'
import { settingsService } from '#server/modules/settings/settings.service'

export default defineEventHandler(async () => {
  const content = await readYoutubeCookies()
  const settings = settingsService.get()
  const meta = settings.youtubeCookies

  return {
    configured: youtubeCookiesService.hasYoutubeCookies(),
    path: getYoutubeCookiesPath(),
    content: content ?? '',
    preview: previewYoutubeCookies(content),
    lastTest: meta?.lastTestAt
      ? {
          at: meta.lastTestAt,
          ok: meta.lastTestOk ?? false,
          message: meta.lastTestMessage ?? ''
        }
      : null
  }
})
