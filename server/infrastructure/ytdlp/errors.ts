const COOKIE_HINT = 'Configurez les cookies YouTube dans Paramètres → Téléchargement (fichier cookies.txt).'

export function isYoutubeAuthFailure(text: string): boolean {
  return /sign in to confirm|--cookies for the authentication|login required|private video|members.only/i.test(text)
}

export function formatYtDlpError(stderr: string, fallback = 'Échec yt-dlp'): string {
  const text = stderr.trim()
  if (!text) return fallback

  if (/sign in to confirm|--cookies-from-browser|--cookies for the authentication/i.test(text)) {
    return `YouTube exige une connexion pour cette vidéo ou playlist (restriction d'âge ou contenu privé). ${COOKIE_HINT}`
  }
  if (/private video|members.only|login required/i.test(text)) {
    return `Cette vidéo ou playlist nécessite une connexion YouTube. ${COOKIE_HINT}`
  }

  return text.length > 800 ? `${text.slice(0, 800)}…` : text
}
