import { join, dirname } from 'node:path'
import { readFile, writeFile, unlink, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { settingsService } from './settings.service'
import { getAppConfigDir, ensureDir } from '../../infrastructure/paths/data-dir'

const COOKIES_FILENAME = 'youtube.txt'

export function getYoutubeCookiesPath(): string {
  const settings = settingsService.get()
  const base = settings.appDataPath || join(settings.libraryPath, '.config')
  return join(base, 'cookies', COOKIES_FILENAME)
}

export function validateCookiesContent(content: string): { valid: boolean, message?: string } {
  const trimmed = content.trim()
  if (!trimmed) return { valid: false, message: 'Le fichier est vide' }

  const hasNetscape = trimmed.includes('# Netscape') || trimmed.includes('# HTTP Cookie File')
  const hasYoutubeLine = /[\t ].*youtube\.com/i.test(trimmed)
    || trimmed.split('\n').some(l => l.trim().startsWith('.youtube.com'))

  if (!hasNetscape && !hasYoutubeLine) {
    return {
      valid: false,
      message: 'Format invalide : attendu cookies.txt Netscape contenant youtube.com'
    }
  }
  return { valid: true }
}

export async function readYoutubeCookies(): Promise<string | null> {
  const path = getYoutubeCookiesPath()
  if (!existsSync(path)) return null
  return readFile(path, 'utf-8')
}

export async function writeYoutubeCookies(content: string): Promise<string> {
  const validation = validateCookiesContent(content)
  if (!validation.valid) {
    throw createError({ statusCode: 400, message: validation.message || 'Contenu invalide' })
  }

  const path = getYoutubeCookiesPath()
  await ensureDir(dirname(path))
  await writeFile(path, content.trimEnd() + '\n', 'utf-8')

  await settingsService.update({
    youtubeCookies: { filePath: path }
  })

  return path
}

export async function deleteYoutubeCookies(): Promise<void> {
  const path = getYoutubeCookiesPath()
  if (existsSync(path)) await unlink(path)
  await settingsService.update({ youtubeCookies: undefined })
}

export function hasYoutubeCookies(): boolean {
  return existsSync(getYoutubeCookiesPath())
}

/** Aperçu masqué pour l'UI (domaines visibles, valeurs tronquées). */
export function previewYoutubeCookies(content: string | null): string[] {
  if (!content) return []
  return content.split('\n')
    .filter(l => l.trim() && !l.startsWith('#'))
    .slice(0, 5)
    .map((line) => {
      const parts = line.split('\t')
      if (parts.length >= 7) {
        return `${parts[0]}\t${parts[5]}=***`
      }
      return line.slice(0, 60) + (line.length > 60 ? '…' : '')
    })
}

export async function saveTestResult(ok: boolean, message: string): Promise<void> {
  const path = getYoutubeCookiesPath()
  await settingsService.update({
    youtubeCookies: {
      filePath: existsSync(path) ? path : undefined,
      lastTestAt: new Date().toISOString(),
      lastTestOk: ok,
      lastTestMessage: message
    }
  })
}

export const youtubeCookiesService = {
  getYoutubeCookiesPath,
  validateCookiesContent,
  readYoutubeCookies,
  writeYoutubeCookies,
  deleteYoutubeCookies,
  hasYoutubeCookies,
  previewYoutubeCookies,
  saveTestResult
}
