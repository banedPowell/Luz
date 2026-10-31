export interface LibraryRepairReport {
  missingTracksRemoved: number
  orphanedPlaylistRefsRemoved: number
  orphanedAlbumRefsRemoved: number
  albumsRenumbered: number
  playlistsNormalized: number
  tracksRenumbered: number
  pathsDeduplicated: number
  errors: string[]
}

export interface RenumberResult {
  updated: number
  errors: string[]
}
