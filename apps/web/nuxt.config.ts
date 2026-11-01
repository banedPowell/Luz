export default defineNuxtConfig({
	compatibilityDate: '2026-10-31',
	devtools: { enabled: true },
	modules: ['@nuxt/ui'],
	css: ['~/assets/css/main.css'],
	typescript: {
		strict: true,
	},
});
