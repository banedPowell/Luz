import { downloadService } from '../../modules/download/download.service'

export default defineEventHandler(() => downloadService.getHistory())
