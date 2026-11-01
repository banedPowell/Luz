import { colorModeCookie } from '~/utils/color-mode';

// Runs after the color-mode plugin, which took its preference from the cookie. The stored
// theme replaces it and is sent back in the cookie, so the color-mode head script applies
// it before the first paint: no flash, even in a new browser or after a change elsewhere.
export default defineNuxtPlugin(async () => {
	const { load } = useSettings();
	try {
		const { theme } = await load();
		useColorMode().preference = theme;
		useCookie(colorModeCookie, { maxAge: 60 * 60 * 24 * 365, path: '/' }).value = theme;
	} catch (error) {
		// The page still renders with the browser's last theme; the settings page shows the error
		console.error('Could not load the settings', error);
	}
});
