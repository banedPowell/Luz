export default defineNuxtConfig({
	compatibilityDate: '2026-10-31',
	devtools: { enabled: true },
	modules: ['@nuxt/ui'],
	css: ['~/assets/css/main.css'],
	// Server-only values, overridden at runtime by NUXT_* variables (see .env.example)
	runtimeConfig: {
		// Empty means the per-OS default, resolved in server/infrastructure/data-directory.ts
		dataDir: '',
		ytDlpPath: 'yt-dlp',
		ffmpegPath: 'ffmpeg',
		ffprobePath: 'ffprobe',
	},
	typescript: {
		strict: true,
	},
	nitro: {
		typescript: {
			// Unit tests exercise server code, so they share its Node and Nitro types.
			// Paths are relative to .nuxt/, where the server tsconfig is generated.
			tsConfig: { include: ['../test/unit/**/*'] },
		},
	},
});
