import { fileURLToPath } from 'node:url';

export const rootDir = fileURLToPath(new URL('../..', import.meta.url));

// Fixed, so the global setup builds there and every test file starts its server from it
export const buildDir = fileURLToPath(new URL('../../.nuxt/test/e2e', import.meta.url));

// The options every e2e file passes to setup(): no build of its own, the shared one
export const sharedBuild = {
	rootDir,
	buildDir,
	build: false,
	nuxtConfig: { nitro: { output: { dir: `${buildDir}/output` } } },
} as const;
