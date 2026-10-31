import { formatRepairReport, libraryRepairService } from '#server/modules/library/library-repair.service'
import type { LibraryRepairReport } from '#shared/domain/repair'

export default defineEventHandler(async (event) => {
  const playlistId = getRouterParam(event, 'playlistId')!
  try {
    const report = await libraryRepairService.repairPlaylist(playlistId)
    return { success: true, report, message: formatRepairReport(report) }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Correction échouée'
    const report: LibraryRepairReport = {
      missingTracksRemoved: 0,
      orphanedPlaylistRefsRemoved: 0,
      orphanedAlbumRefsRemoved: 0,
      albumsRenumbered: 0,
      playlistsNormalized: 0,
      tracksRenumbered: 0,
      pathsDeduplicated: 0,
      errors: [message]
    }
    return { success: false, report, message: formatRepairReport(report) }
  }
})
