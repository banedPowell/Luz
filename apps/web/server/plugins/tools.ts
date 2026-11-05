import { startToolCheck } from '../utils/tools';

// Not awaited, on purpose: Nitro 2 does not wait for plugins, and the server must answer
// while the tools are checked. GET /api/tools reports "pending" until the check ends.
export default defineNitroPlugin(() => {
	void startToolCheck();
});
