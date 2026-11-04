// Loads the settings during server rendering, so the Settings page has them at once. The theme
// is not among them: @nuxtjs/color-mode reads it from its cookie (ADR 0006).
export default defineNuxtPlugin(async () => {
	try {
		await useSettings().load();
	} catch (error) {
		// The settings page shows the error and offers to retry
		console.error('Could not load the settings', error);
	}
});
