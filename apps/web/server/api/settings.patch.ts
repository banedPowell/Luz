import { settingsPatchSchema } from '@luz/core';

import { updateSettings } from '../services/settings';

// A body that does not match the schema is answered with a 400 listing the Zod issues
export default defineEventHandler(async (event) => {
	const patch = await readValidatedBody(event, (body) => settingsPatchSchema.parse(body));
	return updateSettings(await useDatabase(), patch);
});
