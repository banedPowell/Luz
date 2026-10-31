export type AlbumType = 'album' | 'single'

export interface Album {
  id: string
  artistId: string
  title: string
  type: AlbumType
  year?: number
  genre?: string
  artworkPath?: string
  trackIds: string[]
  createdAt: string
  updatedAt: string
}
