import { formatRepairReport, libraryRepairService } from '#server/modules/library/library-repair.service'

export default defineEventHandler(async () => {
  const report = await libraryRepairService.repairAll()
  return { success: true, report, message: formatRepairReport(report) }
})
