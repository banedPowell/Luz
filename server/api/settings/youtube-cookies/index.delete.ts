import { youtubeCookiesService } from '#server/modules/settings/youtube-cookies.service'

export default defineEventHandler(async () => {
  await youtubeCookiesService.deleteYoutubeCookies()
  return { ok: true }
})
