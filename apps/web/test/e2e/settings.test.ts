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
		expect(await $fetch<Settings>('/api/settings')).toEqual({});
	});

	it('updates the settings and returns them', async () => {
		const updated = await $fetch<Settings>('/api/settings', {
			method: 'PATCH',
			body: { musicLibraryPath: ' /music ' },
		});

		expect(updated).toEqual({ musicLibraryPath: '/music' });
		expect(await $fetch<Settings>('/api/settings')).toEqual(updated);
	});

	// The theme is a browser preference, not a setting (ADR 0006)
	it.each([{ theme: 'dark' }, { musicLibraryPath: 'relative/music' }, { volume: 3 }])(
		'rejects the invalid patch %j with a 400',
		async (body) => {
			const response = await fetch('/api/settings', {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(body),
			});

			expect(response.status).toBe(400);
			expect(await $fetch<Settings>('/api/settings')).toEqual({ musicLibraryPath: '/music' });
		},
	);

	it('leaves the theme to the color-mode cookie and never sets it', async () => {
		const response = await fetch('/settings', { headers: { cookie: 'luz-color-mode=dark' } });

		expect(response.headers.get('set-cookie')).toBeNull();
		const html = await response.text();
		// The color-mode head script applies the cookie's theme before the first paint
		expect(html).toContain('luz-color-mode');
		expect(html).toContain('/music');
	});

	it('keeps the settings after a server restart on the same database', async () => {
		await $fetch<Settings>('/api/settings', {
			method: 'PATCH',
			body: { musicLibraryPath: null },
		});

		await stopServer();
		await startServer({ env });

		expect(await $fetch<Settings>('/api/settings')).toEqual({});
	});
});
