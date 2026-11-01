import { defineConfig } from 'vite-plus';

// Shared tooling for the whole workspace. Packages keep their own config only
// for framework or test setup (see ADR 0001).
export default defineConfig({
	fmt: {
		// Mirrors .editorconfig, which Oxfmt also reads; stated here so the
		// formatter does not depend on editor settings.
		useTabs: true,
		tabWidth: 4,
		singleQuote: true,
		endOfLine: 'lf',
		// LICENSE.md is the verbatim PolyForm text and must stay byte-identical
		ignorePatterns: ['pnpm-lock.yaml', 'LICENSE.md'],
		overrides: [
			{
				// YAML forbids tabs for indentation
				files: ['*.yml', '*.yaml'],
				options: { useTabs: false, tabWidth: 2 },
			},
		],
	},
	lint: {
		plugins: ['eslint', 'typescript', 'unicorn', 'oxc', 'import', 'vue'],
		// Warnings do not fail `vp check`, so rules that catch real bugs must be errors
		categories: {
			correctness: 'error',
			suspicious: 'warn',
		},
		ignorePatterns: ['**/.nuxt/**', '**/.output/**', '**/dist/**', '**/coverage/**'],
		options: {
			typeAware: true,
			typeCheck: true,
		},
	},
	staged: {
		'*': 'vp check --fix',
	},
	test: {
		passWithNoTests: true,
		projects: [
			{
				test: {
					name: 'tooling',
					include: ['scripts/**/*.test.ts'],
				},
			},
			'packages/*',
			// Nuxt tests run in their own @nuxt/test-utils config (ADR 0001)
			'apps/web',
			{
				// Plain Node tests for server code, without the cost of the Nuxt environment
				test: {
					name: 'web-unit',
					root: 'apps/web',
					include: ['test/unit/**/*.test.ts'],
					environment: 'node',
					// libSQL finalizes its native statements on garbage collection, and Windows
					// keeps a database file locked until then: tests collect before deleting it
					execArgv: ['--expose-gc'],
				},
			},
			{
				// Builds the app and runs it on a temporary data directory (@nuxt/test-utils/e2e)
				test: {
					name: 'web-e2e',
					root: 'apps/web',
					include: ['test/e2e/**/*.test.ts'],
					environment: 'node',
					// The build alone can take minutes, more on Windows
					hookTimeout: 300_000,
					testTimeout: 60_000,
					// Loaded natively, @nuxt/test-utils would import its own copy of vitest and
					// register its hooks outside the running suite; inlined, it shares the runner's
					server: { deps: { inline: ['@nuxt/test-utils'] } },
				},
			},
		],
	},
});
