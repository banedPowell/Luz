import { formatRepairReport, libraryRepairService } from '#server/modules/library/library-repair.service'

export default defineEventHandler(async (event) => {
  const albumId = getRouterParam(event, 'albumId')!
  const report = await libraryRepairService.repairAlbum(albumId)
  return { success: true, report, message: formatRepairReport(report) }
})
