import { copyFileSync, mkdirSync, mkdtempSync, renameSync, rmSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AlbumSummary, LibraryPage, ScanSummary, TrackSummary } from '@luz/core';
import { $fetch, setup } from '@nuxt/test-utils/e2e';
import { afterAll, describe, expect, it } from 'vitest';
import { missingTools, sharedBuild } from './build';

const fixtures = fileURLToPath(new URL('../fixtures/audio', import.meta.url));

// Temporary folders only: the built server never sees the user's data or music
const dataDir = mkdtempSync(path.join(tmpdir(), 'luz-e2e-'));
const music = mkdtempSync(path.join(tmpdir(), 'luz-e2e-music-'));

afterAll(() => {
	for (const directory of [dataDir, music]) {
		rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
	}
});

function addFixture(name: string) {
	copyFileSync(path.join(fixtures, name), path.join(music, name));
}

async function trackFileNames(): Promise<string[]> {
	const page = await $fetch<LibraryPage<TrackSummary>>('/api/library/tracks');
	return page.items.map((track) => track.fileName).toSorted();
}

describe('library scan', async () => {
	await setup({
		...sharedBuild,
		env: { NUXT_DATA_DIR: dataDir, ...missingTools },
	});

	it('indexes the fixtures, then follows the changes of the folder', async () => {
		for (const name of ['tone.mp3', 'tone.flac', 'tone.ogg', 'corrupt.m4a', 'not-audio.txt']) {
			addFixture(name);
		}
		await $fetch('/api/settings', { method: 'PATCH', body: { musicLibraryPath: music } });

		expect(await $fetch<ScanSummary>('/api/library/scan', { method: 'POST' })).toEqual({
			added: 3,
			updated: 0,
			removed: 0,
			unchanged: 0,
			skipped: 1,
		});
		expect(await trackFileNames()).toEqual(['tone.flac', 'tone.mp3', 'tone.ogg']);

		rmSync(path.join(music, 'tone.ogg'));
		mkdirSync(path.join(music, 'Moved'));
		renameSync(path.join(music, 'tone.flac'), path.join(music, 'Moved', 'tone.flac'));
		const later = new Date('2030-01-01T00:00:00Z');
		utimesSync(path.join(music, 'tone.mp3'), later, later);
		addFixture('tone.opus');

		expect(await $fetch<ScanSummary>('/api/library/scan', { method: 'POST' })).toEqual({
			added: 2,
			updated: 1,
			removed: 2,
			unchanged: 0,
			skipped: 1,
		});
		expect(await trackFileNames()).toEqual(['tone.flac', 'tone.mp3', 'tone.opus']);
		const albums = await $fetch<LibraryPage<AlbumSummary>>('/api/library/albums');
		expect(albums.items).toEqual([
			expect.objectContaining({ title: 'Luz Fixtures', trackCount: 3 }),
		]);

		expect(await $fetch<ScanSummary>('/api/library/scan', { method: 'POST' })).toEqual({
			added: 0,
			updated: 0,
			removed: 0,
			unchanged: 3,
			skipped: 1,
		});
	});

	it('rescans only the tracks it is given, reading them again on request', async () => {
		const page = await $fetch<LibraryPage<TrackSummary>>('/api/library/tracks');
		const mp3 = page.items.find((track) => track.fileName === 'tone.mp3');
		const scope = { kind: 'tracks', ids: [mp3?.id] };

		expect(
			await $fetch<ScanSummary>('/api/library/scan', { method: 'POST', body: { scope } }),
		).toEqual({ added: 0, updated: 0, removed: 0, unchanged: 1, skipped: 0 });
		expect(
			await $fetch<ScanSummary>('/api/library/scan', {
				method: 'POST',
				body: { scope, force: true },
			}),
		).toEqual({ added: 0, updated: 1, removed: 0, unchanged: 0, skipped: 0 });
	});

	it('answers a malformed scan request with a 400', async () => {
		const status = await $fetch('/api/library/scan', {
			method: 'POST',
			body: { scope: { kind: 'tracks', ids: [] } },
		}).then(
			() => 200,
			(error: unknown) =>
				error instanceof Error && 'statusCode' in error ? error.statusCode : 0,
		);

		expect(status).toBe(400);
	});
});
