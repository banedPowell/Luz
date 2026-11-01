import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import { colorModeCookie } from './app/utils/color-mode';

export default defineNuxtConfig({
	compatibilityDate: '2026-10-31',
	devtools: { enabled: true },
	modules: ['@nuxt/ui'],
	css: ['~/assets/css/main.css'],
	colorMode: {
		// A cookie rather than localStorage: the server sets it from the stored theme, and the
		// color-mode head script reads it before the first paint (app/plugins/settings.server.ts)
		storage: 'cookie',
		storageKey: colorModeCookie,
	},
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
		// drizzle-kit loads this config with Node, like nuxt.config.ts
		nodeTsConfig: { include: ['../drizzle.config.ts'] },
	},
	nitro: {
		// Bundles the drizzle-kit migrations into the server, so .output carries them
		serverAssets: [{ baseName: 'migrations', dir: './infrastructure/database/migrations' }],
		externals: {
			traceInclude: libsqlNativeBindings(),
		},
		typescript: {
			// Unit and e2e tests run in Node beside the server, so they share its Node and Nitro types.
			// Paths are relative to .nuxt/, where the server tsconfig is generated.
			tsConfig: { include: ['../test/unit/**/*', '../test/e2e/**/*'] },
		},
	},
});

/**
 * libsql loads its prebuilt binary with a require computed at runtime, which Nitro's
 * file tracing cannot follow, so .output would ship without it. Only the binary of the
 * build platform is installed: build where the server runs (in the Docker image, say).
 */
function libsqlNativeBindings(): string[] {
	const fromClient = createRequire(createRequire(import.meta.url).resolve('@libsql/client'));
	const libsqlEntry = fromClient.resolve('libsql');
	const manifest: unknown = JSON.parse(
		readFileSync(path.join(path.dirname(libsqlEntry), 'package.json'), 'utf8'),
	);
	const bindings =
		typeof manifest === 'object' && manifest !== null && 'optionalDependencies' in manifest
			? Object.keys(manifest.optionalDependencies ?? {})
			: [];

	const fromLibsql = createRequire(libsqlEntry);
	return bindings.flatMap((binding) => {
		try {
			return [fromLibsql.resolve(binding)];
		} catch {
			// Not installed: built for another platform
			return [];
		}
	});
}
