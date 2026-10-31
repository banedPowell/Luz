import { z } from 'zod'
import { youtubeCookiesService } from '#server/modules/settings/youtube-cookies.service'

const bodySchema = z.object({ content: z.string() })

export default defineEventHandler(async (event) => {
  const { content } = bodySchema.parse(await readBody(event))
  const path = await youtubeCookiesService.writeYoutubeCookies(content)
  return { ok: true, path }
})
