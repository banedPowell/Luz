import { z } from 'zod'
import { settingsService } from '../../modules/settings/settings.service'

const downloadDefaultsSchema = z.object({
  format: z.string(),
  quality: z.string(),
  embedCover: z.boolean(),
  writeMetadata: z.boolean()
}).partial()

const metadataRulesSchema = z.object({
  featStrategy: z.enum(['metadata_only', 'title_and_metadata', 'title_only'])
}).partial()

const youtubeCookiesSchema = z.object({
  filePath: z.string().optional(),
  lastTestAt: z.string().optional(),
  lastTestOk: z.boolean().optional(),
  lastTestMessage: z.string().optional()
}).partial()

const bodySchema = z.object({
  theme: z.enum(['light', 'dark', 'system']).optional(),
  accent: z.string().optional(),
  language: z.string().optional(),
  thumbnailSize: z.enum(['sm', 'md', 'lg']).optional(),
  sidebarCollapsed: z.boolean().optional(),
  cachePolicy: z.enum(['reuse', 'duplicate', 'ask']).optional(),
  downloadConcurrency: z.number().min(1).max(4).optional(),
  appDataPath: z.string().optional(),
  libraryPath: z.string().optional(),
  outputTemplate: z.string().optional(),
  playlistOutputTemplate: z.string().optional(),
  supportedFormats: z.array(z.string()).optional(),
  downloadDefaults: downloadDefaultsSchema.optional(),
  metadataRules: metadataRulesSchema.optional(),
  youtubeCookies: youtubeCookiesSchema.optional()
})

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const parsed = bodySchema.parse(body)
  return settingsService.update(parsed)
})
