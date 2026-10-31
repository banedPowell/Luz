// https://nuxt.com/docs/api/configuration/nuxt-config
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const rootDir = dirname(fileURLToPath(import.meta.url))

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  modules: ['@nuxt/ui', '@pinia/nuxt'],
  css: ['~/assets/css/main.css'],
  alias: {
    '#shared': resolve(rootDir, 'shared'),
    '#server': resolve(rootDir, 'server')
  },
  runtimeConfig: {
    luzDataDir: process.env.LUZ_DATA_DIR || '',
    ytdlpPath: process.env.YTDLP_PATH || 'yt-dlp',
    ffmpegPath: process.env.FFMPEG_PATH || 'ffmpeg'
  }
})
