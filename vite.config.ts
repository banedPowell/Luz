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
		],
	},
});
