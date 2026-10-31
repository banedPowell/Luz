import type { Album } from '#shared/domain/album'

export type AlbumDetail = Album & { releaseDate?: string }
