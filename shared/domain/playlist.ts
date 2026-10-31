export interface Playlist {
  id: string
  name: string
  description?: string
  trackIds: string[]
  type: 'user'
  createdAt: string
  updatedAt: string
}
