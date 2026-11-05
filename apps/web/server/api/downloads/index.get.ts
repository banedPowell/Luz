import { listDownloadJobs } from '../../infrastructure/database/download-repository';

export default defineEventHandler(async () => listDownloadJobs(await useDatabase()));
