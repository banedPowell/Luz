import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { DownloadJob } from '@luz/core';
import { $fetch, fetch, setup } from '@nuxt/test-utils/e2e';
import { afterAll, describe, expect, it } from 'vitest';
import { missingTools, sharedBuild } from './build';

const dataDir = mkdtempSync(path.join(tmpdir(), 'luz-e2e-'));
const env = { NUXT_DATA_DIR: dataDir, ...missingTools };

afterAll(() => {
	rmSync(dataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});

// The queue itself runs with a fake yt-dlp in the unit tests; here, the routes and the plugin
describe('downloads API', async () => {
	await setup({ ...sharedBuild, env });

	it('lists no job on an empty data directory', async () => {
		expect(await $fetch<DownloadJob[]>('/api/downloads')).toEqual([]);
	});

	it.each([
		{},
		{ url: 'https://example.com/x', itemIds: [] },
		{ url: 'file:///etc/passwd', itemIds: ['a'] },
	])('rejects the invalid request %j with a 400', async (body) => {
		const response = await fetch('/api/downloads', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body),
		});
		expect(response.status).toBe(400);
	});

	it('refuses to queue a download before the library folder is chosen', async () => {
		const response = await fetch('/api/downloads', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ url: 'https://example.com/x', itemIds: ['a'] }),
		});
		expect(response.status).toBe(409);
		expect(await $fetch<DownloadJob[]>('/api/downloads')).toEqual([]);
	});

	it('opens the stream of events', async () => {
		const controller = new AbortController();
		const response = await fetch('/api/downloads/events', { signal: controller.signal });
		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toContain('text/event-stream');
		// A browser only fires `open`, where the client loads the list, once something arrives
		const reader = response.body?.getReader();
		const first = await reader?.read();
		expect(new TextDecoder().decode(first?.value)).toContain('event: ping');
		controller.abort();
	});

	it('answers 404 when cancelling an unknown job, 400 for an invalid id', async () => {
		expect((await fetch('/api/downloads/42', { method: 'DELETE' })).status).toBe(404);
		expect((await fetch('/api/downloads/abc', { method: 'DELETE' })).status).toBe(400);
	});
});
