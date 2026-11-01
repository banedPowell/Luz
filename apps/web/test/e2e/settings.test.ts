import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Settings } from '@luz/core';
import { $fetch, fetch, setup, startServer, stopServer } from '@nuxt/test-utils/e2e';
import { afterAll, describe, expect, it } from 'vitest';
import { sharedBuild } from './build';

// A fresh data directory: the built server creates its database there, never in the user's
const dataDir = mkdtempSync(path.join(tmpdir(), 'luz-e2e-'));
const env = { NUXT_DATA_DIR: dataDir };

// At file level, so it runs once setup() has stopped the server and released the database
afterAll(() => {
	rmSync(dataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});

describe('settings API', async () => {
	await setup({
		...sharedBuild,
		env,
	});

	it('returns the defaults on an empty data directory', async () => {
		expect(await $fetch<Settings>('/api/settings')).toEqual({ theme: 'system' });
	});

	it('updates the settings and returns them', async () => {
		const updated = await $fetch<Settings>('/api/settings', {
			method: 'PATCH',
			body: { theme: 'dark', musicLibraryPath: ' /music ' },
		});

		expect(updated).toEqual({ theme: 'dark', musicLibraryPath: '/music' });
		expect(await $fetch<Settings>('/api/settings')).toEqual(updated);
	});

	it.each([{ theme: 'sepia' }, { musicLibraryPath: 'relative/music' }, { volume: 3 }])(
		'rejects the invalid patch %j with a 400',
		async (body) => {
			const response = await fetch('/api/settings', {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(body),
			});

			expect(response.status).toBe(400);
			expect(await $fetch<Settings>('/api/settings')).toEqual({
				theme: 'dark',
				musicLibraryPath: '/music',
			});
		},
	);

	it('renders pages in the stored theme and hands it to the color-mode cookie', async () => {
		const response = await fetch('/settings');

		expect(response.headers.get('set-cookie')).toMatch(/luz-color-mode=dark/);
		expect(await response.text()).toContain('/music');
	});

	it('keeps the settings after a server restart on the same database', async () => {
		await $fetch<Settings>('/api/settings', {
			method: 'PATCH',
			body: { musicLibraryPath: null },
		});

		await stopServer();
		await startServer({ env });

		expect(await $fetch<Settings>('/api/settings')).toEqual({ theme: 'dark' });
	});
});
