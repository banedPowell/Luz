import { readFile, writeFile } from 'node:fs/promises';

import {
	ffmetadataOf,
	ffmpegConvertArgs,
	ffmpegCoverArgs,
	parseFfmpegProgressLine,
	type OutputTarget,
	type TrackTags,
} from '@luz/core';

import type { ProcessRunner } from './process-runner';

export type FfmpegResult =
	| { ok: true }
	| { ok: false; reason: 'tool-unavailable' | 'failed' | 'aborted' };

export interface RunHooks {
	signal?: AbortSignal;
	/** What FFmpeg prints on stderr (warnings and errors), for the item log. */
	onLine?: (line: string) => void;
}

export interface Conversion {
	/** The file yt-dlp downloaded. */
	audio: string;
	tags: TrackTags;
	/** A square JPEG, from squareCover(). */
	cover?: string;
	/** Where the tags are written for FFmpeg to read. */
	metadataFile: string;
	output: string;
	target: OutputTarget;
	/** The length of the track, to tell a percent from FFmpeg's position. */
	durationMs?: number;
}

export interface Ffmpeg {
	/** Crops a thumbnail to a square JPEG, the cover a file embeds. */
	squareCover(input: string, output: string, hooks?: RunHooks): Promise<FfmpegResult>;
	/** Writes the output file: audio copied or encoded, tags and cover embedded. */
	convert(
		conversion: Conversion,
		hooks?: RunHooks & { onProgress?: (percent: number) => void },
	): Promise<FfmpegResult>;
}

/** FFmpeg through the process runner; every argument comes from @luz/core. */
export function createFfmpeg(runner: ProcessRunner, command: string): Ffmpeg {
	async function run(
		args: string[],
		hooks: RunHooks,
		onStdoutLine?: (line: string) => void,
	): Promise<FfmpegResult> {
		const result = await runner.run(command, {
			args,
			signal: hooks.signal,
			onStdoutLine,
			onStderrLine: hooks.onLine,
		});
		if (result.outcome === 'aborted') {
			return { ok: false, reason: 'aborted' };
		}
		if (result.outcome === 'spawn-failed') {
			hooks.onLine?.(result.message);
			return { ok: false, reason: 'tool-unavailable' };
		}
		return result.outcome === 'exited' && result.exitCode === 0
			? { ok: true }
			: { ok: false, reason: 'failed' };
	}

	return {
		squareCover(input, output, hooks = {}) {
			return run(ffmpegCoverArgs(input, output), hooks);
		},

		async convert(conversion, hooks = {}) {
			const { cover, target } = conversion;
			const pictureBlock =
				cover !== undefined && target.cover === 'picture-block'
					? flacPictureBlock(await readFile(cover))
					: undefined;
			await writeFile(conversion.metadataFile, ffmetadataOf(conversion.tags, pictureBlock));
			return run(
				ffmpegConvertArgs(
					{
						audio: conversion.audio,
						metadata: conversion.metadataFile,
						...(cover === undefined ? {} : { cover }),
						output: conversion.output,
					},
					target,
				),
				hooks,
				(line) => {
					const percent = parseFfmpegProgressLine(line, conversion.durationMs);
					if (percent !== undefined) {
						hooks.onProgress?.(percent);
					}
				},
			);
		},
	};
}

/**
 * A JPEG as the base64 FLAC picture block Ogg files carry their cover in: type 3 (front
 * cover), MIME type, empty description, unknown dimensions, then the image.
 */
export function flacPictureBlock(jpeg: Uint8Array): string {
	const mime = Buffer.from('image/jpeg', 'ascii');
	return Buffer.concat([
		uint32(3),
		uint32(mime.length),
		mime,
		uint32(0),
		// Width, height, colour depth and palette size: 0 lets the reader take them from the image
		uint32(0),
		uint32(0),
		uint32(0),
		uint32(0),
		uint32(jpeg.length),
		jpeg,
	]).toString('base64');
}

function uint32(value: number): Buffer {
	const bytes = Buffer.alloc(4);
	bytes.writeUInt32BE(value);
	return bytes;
}
