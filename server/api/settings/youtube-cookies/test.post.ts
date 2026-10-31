import { runCommand } from '#server/infrastructure/ytdlp/command'
import { youtubeCookiesService } from '#server/modules/settings/youtube-cookies.service'
import { buildYoutubeCompatArgs } from '#server/infrastructure/ytdlp/command-builder'
import { formatYtDlpError } from '#server/infrastructure/ytdlp/errors'
import { settingsService } from '#server/modules/settings/settings.service'

/** Vidéo publique courte pour valider que yt-dlp fonctionne avec les cookies. */
const TEST_URL = 'https://www.youtube.com/watch?v=jNQXAC9IVRw'

export default defineEventHandler(async () => {
  if (!youtubeCookiesService.hasYoutubeCookies()) {
    throw createError({
      statusCode: 400,
      message: 'Aucun fichier cookies configuré. Enregistrez d\'abord vos cookies.'
    })
  }

  const config = useRuntimeConfig()
  const ytdlpPath = config.ytdlpPath || 'yt-dlp'
  const settings = settingsService.get()

  const args = [
    ...buildYoutubeCompatArgs(settings),
    '--dump-single-json',
    '--no-warnings',
    '--playlist-items', '1',
    TEST_URL
  ]

  const result = await runCommand(ytdlpPath, args)

  if (result.code !== 0) {
    const message = formatYtDlpError(result.stderr, 'Test de connexion échoué')
    await youtubeCookiesService.saveTestResult(false, message)
    return { ok: false, message }
  }

  let title: string | undefined
  try {
    const data = JSON.parse(result.stdout)
    title = data.title as string | undefined
  } catch { /* ignore */ }

  const message = title
    ? `Connexion OK — test réussi (${title})`
    : 'Connexion OK — cookies acceptés par YouTube'

  await youtubeCookiesService.saveTestResult(true, message)
  return { ok: true, message, title }
})
