import { getSettings } from '../services/settings';

export default defineEventHandler(async () => getSettings(await useDatabase()));
