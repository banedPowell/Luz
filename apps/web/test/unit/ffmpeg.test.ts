import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { ffmpegConvertArgs, ffmpegCoverArgs, type OutputTarget } from '@luz/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createFfmpeg, type Conversion } from '../../server/infrastructure/ffmpeg';
import type {
	RunResult,
	ProcessRunner,
	RunOptions,
} from '../../server/infrastructure/process-runner';

let dir: string;

beforeEach(() => {
	dir = mkdtempSync(path.join(tmpdir(), 'luz-ffmpeg-'));
});

afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
});

/** A runner that prints the given lines, then ends with `result`; records every call. */
function fakeRunner(
	result: RunResult,
	output: { stdout?: string[]; stderr?: string[] } = {},
): ProcessRunner & { calls: { command: string; options: RunOptions }[] } {
	const calls: { command: string; options: RunOptions }[] = [];
	return {
		calls,
		async run(command, options) {
			calls.push({ command, options });
			for (const line of output.stdout ?? []) {
				options.onStdoutLine?.(line);
			}
			for (const line of output.stderr ?? []) {
				options.onStderrLine?.(line);
			}
			return result;
		},
	};
}

const mp3: OutputTarget = { extension: '.mp3', mp3BitrateKbps: 192, cover: 'stream' };

function conversion(target: OutputTarget, cover?: string): Conversion {
	return {
		audio: '/job/7.webm',
		tags: { title: 'Song', artists: ['Band'] },
		...(cover === undefined ? {} : { cover }),
		metadataFile: path.join(dir, '7.tags.ffmetadata'),
		output: `/job/7.converted${target.extension}`,
		target,
		durationMs: 180_000,
	};
}

describe('ffmpeg adapter', () => {
	it('writes the tags, converts with the arguments of the target and reports progress', async () => {
		const runner = fakeRunner(
			{ outcome: 'exited', exitCode: 0 },
			{
				stdout: ['out_time_us=90000000', 'progress=continue', 'progress=end'],
				stderr: ['[mp3 @ 0x1] a warning'],
			},
		);
		const percents: number[] = [];
		const lines: string[] = [];
		const signal = new AbortController().signal;

		const result = await createFfmpeg(runner, '/bin/ffmpeg').convert(conversion(mp3), {
			signal,
			onLine: (line) => lines.push(line),
			onProgress: (percent) => percents.push(percent),
		});

		expect(result).toEqual({ ok: true });
		expect(runner.calls[0]?.command).toBe('/bin/ffmpeg');
		expect(runner.calls[0]?.options.signal).toBe(signal);
		expect(runner.calls[0]?.options.args).toEqual(
			ffmpegConvertArgs(
				{
					audio: '/job/7.webm',
					metadata: path.join(dir, '7.tags.ffmetadata'),
					output: '/job/7.converted.mp3',
				},
				mp3,
			),
		);
		expect(readFileSync(path.join(dir, '7.tags.ffmetadata'), 'utf8')).toBe(
			';FFMETADATA1\ntitle=Song\nartist=Band\n',
		);
		expect(percents).toEqual([50, 100]);
		expect(lines).toEqual(['[mp3 @ 0x1] a warning']);
	});

	it('puts the cover of an Opus file in its tags, as a FLAC picture block', async () => {
		const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]);
		const cover = path.join(dir, '7.square.jpg');
		writeFileSync(cover, jpeg);
		const runner = fakeRunner({ outcome: 'exited', exitCode: 0 });

		await createFfmpeg(runner, 'ffmpeg').convert(
			conversion({ extension: '.opus', cover: 'picture-block' }, cover),
		);

		// The Ogg muxer takes no picture stream: the cover is only in the metadata
		expect(runner.calls[0]?.options.args).not.toContain(cover);
		const line = readFileSync(path.join(dir, '7.tags.ffmetadata'), 'utf8')
			.split('\n')
			.find((entry) => entry.startsWith('METADATA_BLOCK_PICTURE='));
		const block = Buffer.from(
			(line ?? '').slice('METADATA_BLOCK_PICTURE='.length).replaceAll('\\=', '='),
			'base64',
		);
		expect(block.readUInt32BE(0)).toBe(3);
		expect(block.readUInt32BE(4)).toBe(10);
		expect(block.subarray(8, 18).toString('ascii')).toBe('image/jpeg');
		expect(block.readUInt32BE(38)).toBe(jpeg.length);
		expect(block.subarray(42)).toEqual(jpeg);
	});

	it('gives an MP3 its cover as an attached picture stream', async () => {
		const runner = fakeRunner({ outcome: 'exited', exitCode: 0 });

		await createFfmpeg(runner, 'ffmpeg').convert(conversion(mp3, '/job/7.square.jpg'));

		expect(runner.calls[0]?.options.args).toContain('/job/7.square.jpg');
		expect(readFileSync(path.join(dir, '7.tags.ffmetadata'), 'utf8')).not.toContain(
			'METADATA_BLOCK_PICTURE',
		);
	});

	it('crops a thumbnail to a square cover', async () => {
		const runner = fakeRunner({ outcome: 'exited', exitCode: 0 });

		const result = await createFfmpeg(runner, 'ffmpeg').squareCover(
			'/job/7.cover.webp',
			'/job/7.square.jpg',
		);

		expect(result).toEqual({ ok: true });
		expect(runner.calls[0]?.options.args).toEqual(
			ffmpegCoverArgs('/job/7.cover.webp', '/job/7.square.jpg'),
		);
	});

	it.each([
		[{ outcome: 'aborted' }, 'aborted'],
		[{ outcome: 'exited', exitCode: 1 }, 'failed'],
		[{ outcome: 'timed-out' }, 'failed'],
		[{ outcome: 'killed', signal: 'SIGKILL' }, 'failed'],
	] as [RunResult, string][])('names an outcome of %j as %s', async (outcome, reason) => {
		const ffmpeg = createFfmpeg(fakeRunner(outcome), 'ffmpeg');

		expect(await ffmpeg.squareCover('/in.webp', '/out.jpg')).toEqual({ ok: false, reason });
	});

	it('tells a missing FFmpeg apart, with the reason in the log', async () => {
		const runner = fakeRunner({
			outcome: 'spawn-failed',
			code: 'ENOENT',
			message: 'spawn ffmpeg ENOENT',
		});
		const lines: string[] = [];

		const result = await createFfmpeg(runner, 'ffmpeg').convert(conversion(mp3), {
			onLine: (line) => lines.push(line),
		});

		expect(result).toEqual({ ok: false, reason: 'tool-unavailable' });
		expect(lines).toEqual(['spawn ffmpeg ENOENT']);
	});
});
