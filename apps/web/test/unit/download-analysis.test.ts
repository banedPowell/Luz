import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { defaultSettings, type Settings, type ToolStatus } from '@luz/core';
import { afterEach, describe, expect, it } from 'vitest';

import { listFileNames } from '../../server/infrastructure/file-system';
import type {
	ProcessRunner,
	RunOptions,
	RunResult,
} from '../../server/infrastructure/process-runner';
import { createYtDlp } from '../../server/infrastructure/yt-dlp';
import { AnalysisError, analyzeUrl } from '../../server/services/download-analysis';

const fixtures = path.join(import.meta.dirname, '../fixtures/yt-dlp');

function fixtureLines(name: string): string[] {
	return readFileSync(path.join(fixtures, name), 'utf8').trimEnd().split('\n');
}

interface Script {
	stdout?: string[];
	stderr?: string[];
	result: RunResult;
}

// Plays a scripted run, as yt-dlp would print it, and records how it was called
function fakeRunner(script: Script) {
	const calls: { command: string; options: RunOptions }[] = [];
	const runner: ProcessRunner = {
		async run(command, options) {
			calls.push({ command, options });
			for (const line of script.stdout ?? []) {
				options.onStdoutLine?.(line);
			}
			for (const line of script.stderr ?? []) {
				options.onStderrLine?.(line);
			}
			return script.result;
		},
	};
	return { runner, calls };
}

const exited = (exitCode: number): RunResult => ({ outcome: 'exited', exitCode });

const available: ToolStatus = { tool: 'yt-dlp', command: 'yt-dlp', state: 'available' };

let library: string | undefined;

afterEach(async () => {
	if (library) {
		await rm(library, { recursive: true, force: true });
		library = undefined;
	}
});

async function tempLibrary(files: string[] = []): Promise<string> {
	library = await mkdtemp(path.join(tmpdir(), 'luz-analysis-'));
	for (const file of files) {
		await mkdir(path.dirname(path.join(library, file)), { recursive: true });
		await writeFile(path.join(library, file), '');
	}
	return library;
}

async function analyze(script: Script, settings: Partial<Settings> = {}, status = available) {
	const { runner, calls } = fakeRunner(script);
	const preview = analyzeUrl('https://www.youtube.com/watch?v=x', {
		ytDlp: createYtDlp(runner, '/opt/yt-dlp', 5000),
		ytDlpStatus: status,
		settings: { ...defaultSettings, ...settings },
		listFileNames,
	});
	return { preview, calls };
}

async function analysisError(promise: Promise<unknown>): Promise<AnalysisError> {
	const error: unknown = await promise.then(
		() => undefined,
		(reason: unknown) => reason,
	);
	if (!(error instanceof AnalysisError)) {
		throw new Error(`Expected an AnalysisError, got ${String(error)}`);
	}
	return error;
}

describe('URL analysis', () => {
	it('runs yt-dlp without downloading, the URL after "--", with a timeout', async () => {
		const musicLibraryPath = await tempLibrary();
		const { preview, calls } = await analyze(
			{ stdout: fixtureLines('track.json'), result: exited(0) },
			{ musicLibraryPath },
		);
		await preview;
		expect(calls).toHaveLength(1);
		expect(calls[0]?.command).toBe('/opt/yt-dlp');
		expect(calls[0]?.options.args).toEqual([
			'--dump-single-json',
			'--flat-playlist',
			'--no-warnings',
			'--',
			'https://www.youtube.com/watch?v=x',
		]);
		expect(calls[0]?.options.timeoutMs).toBe(5000);
	});

	it('previews one track with its tags and its path in the library', async () => {
		const musicLibraryPath = await tempLibrary();
		const { preview } = await analyze(
			{ stdout: fixtureLines('track.json'), result: exited(0) },
			{ musicLibraryPath },
		);
		expect(await preview).toEqual({
			kind: 'track',
			title: 'Daft Punk - Digital Love (Official Audio)',
			items: [
				{
					sourceId: 'dQw4w9WgXcQ',
					url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
					thumbnailUrl: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg',
					tags: {
						title: 'Digital Love',
						artists: ['Daft Punk'],
						album: 'Discovery',
						year: 2001,
						durationMs: 301_400,
					},
					pathWithoutExtension: 'Daft Punk/Discovery/1-00 Digital Love',
					alreadyInLibrary: false,
				},
			],
		});
	});

	it('previews a playlist and flags what is already in the library, any format or case', async () => {
		const musicLibraryPath = await tempLibrary([
			'Daft Punk/Discovery/01 one more time.FLAC',
			// Not audio, so not the same track
			'Daft Punk/Discovery/02 Aerodynamic.txt',
			'Daft Punk/Discovery/03 Digital Love.mp3',
		]);
		const { preview } = await analyze(
			{ stdout: fixtureLines('playlist.json'), result: exited(0) },
			{ musicLibraryPath, namingTemplate: '{artist}/{album}/{track:02} {title}' },
		);
		const result = await preview;
		expect(result.kind).toBe('playlist');
		expect(result.title).toBe('Discovery');
		expect(
			result.items.map((item) => [item.pathWithoutExtension, item.alreadyInLibrary]),
		).toEqual([
			['Daft Punk/Discovery/01 One More Time', true],
			['Daft Punk/Discovery/02 Aerodynamic', false],
			['Daft Punk/Discovery/03 Digital Love', true],
		]);
	});

	it('explains a private video and keeps the yt-dlp output for the details', async () => {
		const stderr = fixtureLines('private-video.stderr.txt');
		const { preview } = await analyze(
			{ stderr, result: exited(1) },
			{ musicLibraryPath: await tempLibrary() },
		);
		const error = await analysisError(preview);
		expect(error.reason).toBe('unavailable');
		expect(error.message).toMatch(/private, removed/);
		expect(error.details).toEqual(stderr);
	});

	it.each([
		[
			{ outcome: 'spawn-failed', code: 'ENOENT', message: 'spawn yt-dlp ENOENT' },
			'tool-unavailable',
		],
		[{ outcome: 'timed-out' }, 'timed-out'],
		[{ outcome: 'killed', signal: 'SIGKILL' }, 'failed'],
	] as const)('reports a run that ended with %j as %s', async (result, reason) => {
		const { preview } = await analyze({ result }, { musicLibraryPath: await tempLibrary() });
		expect((await analysisError(preview)).reason).toBe(reason);
	});

	it('reports output that is not the expected JSON', async () => {
		const { preview } = await analyze(
			{ stdout: ['{"title": "no id"}'], result: exited(0) },
			{ musicLibraryPath: await tempLibrary() },
		);
		expect((await analysisError(preview)).reason).toBe('failed');
	});

	it('does not run yt-dlp when the startup check found it missing', async () => {
		const { preview, calls } = await analyze(
			{ result: exited(0) },
			{ musicLibraryPath: await tempLibrary() },
			{ tool: 'yt-dlp', command: 'yt-dlp', state: 'unavailable', error: 'Not found.' },
		);
		const error = await analysisError(preview);
		expect(error.reason).toBe('tool-unavailable');
		expect(error.details).toEqual(['Not found.']);
		expect(calls).toHaveLength(0);
	});

	it('asks for a library folder first', async () => {
		const { preview, calls } = await analyze({ result: exited(0) });
		expect((await analysisError(preview)).reason).toBe('library-path-unset');
		expect(calls).toHaveLength(0);
	});

	it('keeps only the end of a long error output', async () => {
		const stderr = Array.from({ length: 80 }, (_, index) => `line ${index}`);
		const { preview } = await analyze(
			{ stderr, result: exited(1) },
			{ musicLibraryPath: await tempLibrary() },
		);
		const { details } = await analysisError(preview);
		expect(details).toHaveLength(50);
		expect(details.at(-1)).toBe('line 79');
	});
});
