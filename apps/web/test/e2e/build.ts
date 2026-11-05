import { fileURLToPath } from 'node:url';

export const rootDir = fileURLToPath(new URL('../..', import.meta.url));

// Fixed, so the global setup builds there and every test file starts its server from it
export const buildDir = fileURLToPath(new URL('../../.nuxt/test/e2e', import.meta.url));

// Every e2e server checks its tools at startup: commands that cannot exist, so the real
// yt-dlp and FFmpeg are never run by a test, and the check ends at once as "unavailable"
export const missingTools = {
	NUXT_YT_DLP_PATH: 'luz-e2e-missing-yt-dlp',
	NUXT_FFMPEG_PATH: 'luz-e2e-missing-ffmpeg',
	NUXT_FFPROBE_PATH: 'luz-e2e-missing-ffprobe',
} as const;

// The options every e2e file passes to setup(): no build of its own, the shared one
export const sharedBuild = {
	rootDir,
	buildDir,
	build: false,
	nuxtConfig: { nitro: { output: { dir: `${buildDir}/output` } } },
} as const;
