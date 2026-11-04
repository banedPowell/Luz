import { chmodSync, copyFileSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createTagReader } from '../../server/infrastructure/tag-reader';

const fixtures = fileURLToPath(new URL('../fixtures/audio/', import.meta.url));
const fixture = (name: string) => path.join(fixtures, name);

// The tags written into every fixture (see test/fixtures/audio/README.md)
const fixtureTags = {
	title: 'Fixture Tone',
	artists: ['Luz Test Artist'],
	album: 'Luz Fixtures',
	albumArtist: 'Luz Test Band',
	trackNumber: 3,
	discNumber: 1,
	year: 2024,
	genre: 'Test',
};

describe('createTagReader', () => {
	const reader = createTagReader();

	it.each(['tone.mp3', 'tone.flac', 'tone.m4a', 'tone.ogg', 'tone.opus'])(
		'reads the tags of %s',
		async (name) => {
			const result = await reader.read(fixture(name));

			expect(result.ok).toBe(true);
			if (!result.ok) return;
			const { durationMs, ...tags } = result.tags;
			expect(tags).toEqual(fixtureTags);
			// Encoders pad the half-second tone differently
			expect(durationMs).toBeGreaterThanOrEqual(400);
			expect(durationMs).toBeLessThanOrEqual(800);
		},
	);

	// ALAC and AAC share the .m4a extension: only the codec tells them apart
	it.each([
		['tone.flac', 'FLAC', true],
		['tone-alac.m4a', 'ALAC', true],
		['tone.wav', 'PCM', true],
		['tone.aiff', 'PCM', true],
		['tone.m4a', 'AAC', false],
		['tone.mp3', 'MP3', false],
		['tone.ogg', 'Vorbis', false],
		['tone.opus', 'Opus', false],
	])('reads the codec of %s as %s, lossless: %s', async (name, codec, lossless) => {
		const result = await reader.read(fixture(name));

		expect(result).toMatchObject({ ok: true, audio: { codec, lossless } });
	});

	it('reads the measures of the audio', async () => {
		// Mono silence at 8 kHz; FFmpeg encodes the MP3 at a constant 8 kbps
		expect(await reader.read(fixture('tone.mp3'))).toMatchObject({
			ok: true,
			audio: {
				codecProfile: 'CBR',
				bitrate: 8000,
				sampleRate: 8000,
				bitDepth: null,
				channels: 1,
			},
		});
		expect(await reader.read(fixture('tone.wav'))).toMatchObject({
			ok: true,
			audio: { codecProfile: null, bitrate: 128_000, sampleRate: 8000, bitDepth: 16 },
		});
	});

	it('reports a file that is not audio as unsupported', async () => {
		const result = await reader.read(fixture('not-audio.txt'));

		expect(result).toEqual({
			ok: false,
			error: { kind: 'unsupported', message: expect.any(String) },
		});
	});

	it('reports a corrupt file as unreadable', async () => {
		const result = await reader.read(fixture('corrupt.m4a'));

		expect(result).toEqual({
			ok: false,
			error: { kind: 'unreadable', message: expect.any(String) },
		});
	});

	it('reports a missing file as unreadable', async () => {
		const result = await reader.read(fixture('missing.mp3'));

		expect(result).toMatchObject({ ok: false, error: { kind: 'unreadable' } });
	});

	describe('on a read-only copy', () => {
		let directory: string;
		let copy: string;

		beforeEach(() => {
			directory = mkdtempSync(path.join(tmpdir(), 'luz-tags-'));
			copy = path.join(directory, 'tone.flac');
			copyFileSync(fixture('tone.flac'), copy);
			chmodSync(copy, 0o444);
		});

		afterEach(() => {
			// Windows refuses to delete a read-only file
			chmodSync(copy, 0o644);
			rmSync(directory, { recursive: true, force: true });
		});

		it('reads the tags without changing the file', async () => {
			const before = { bytes: readFileSync(copy), modifiedAtMs: statSync(copy).mtimeMs };

			const result = await reader.read(copy);

			expect(result.ok).toBe(true);
			expect(readFileSync(copy).equals(before.bytes)).toBe(true);
			expect(statSync(copy).mtimeMs).toBe(before.modifiedAtMs);
		});
	});
});
