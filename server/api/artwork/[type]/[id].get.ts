import { createReadStream, existsSync } from 'node:fs'
import { sendStream } from 'h3'
import { artworkService } from '#server/modules/artwork/artwork.service'

export default defineEventHandler((event) => {
  const type = getRouterParam(event, 'type') as 'album' | 'artist'
  const id = getRouterParam(event, 'id')
  if (!type || !id || !['album', 'artist'].includes(type)) {
    throw createError({ statusCode: 400, message: 'Invalid type' })
  }

  const path = artworkService.getArtworkPath(type, id)
  if (!existsSync(path)) {
    throw createError({ statusCode: 404, message: 'Artwork not found' })
  }

  setResponseHeader(event, 'Content-Type', 'image/jpeg')
  setResponseHeader(event, 'Cache-Control', 'public, max-age=86400')
  return sendStream(event, createReadStream(path))
})
