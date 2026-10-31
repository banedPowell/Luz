export interface Artist {
  id: string
  name: string
  sortName: string
  imagePath?: string
  albumIds: string[]
  trackIds: string[]
  createdAt: string
  updatedAt: string
}
