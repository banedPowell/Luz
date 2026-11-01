import { fileURLToPath } from 'node:url';
import { defineVitestProject } from '@nuxt/test-utils/config';

// Nuxt tests need the Nuxt environment from @nuxt/test-utils, hence this
// package-level config (ADR 0001). The root vite.config.ts lists it as a
// test project so `vp run test` stays the single entry point.
export default defineVitestProject({
	test: {
		name: 'web',
		include: ['test/nuxt/**/*.test.ts'],
		environment: 'nuxt',
		environmentOptions: {
			nuxt: {
				// Tests are started from the repository root, where Nuxt is not installed
				rootDir: fileURLToPath(new URL('.', import.meta.url)),
				domEnvironment: 'happy-dom',
			},
		},
	},
});
