import { describe, expect, it } from 'vitest';

import { parseToolVersion, toolDefinitions, toolNames } from './tools.ts';

describe('parseToolVersion', () => {
	it.each([
		['yt-dlp', '2025.10.22', '2025.10.22'],
		['yt-dlp', '2025.10.22.233015\r', '2025.10.22.233015'],
		['ffmpeg', 'ffmpeg version 7.1.1 Copyright (c) 2000-2025 the FFmpeg developers', '7.1.1'],
		[
			'ffmpeg',
			'ffmpeg version N-118000-gabc123-20250101 Copyright',
			'N-118000-gabc123-20250101',
		],
		['ffprobe', 'ffprobe version 6.1.1-3ubuntu5 Copyright (c) 2007-2023', '6.1.1-3ubuntu5'],
	] as const)('reads the version of %s from %j', (tool, line, version) => {
		expect(parseToolVersion(tool, line)).toBe(version);
	});

	it.each([
		['yt-dlp', 'Usage: yt-dlp [OPTIONS] URL'],
		['yt-dlp', ''],
		['ffmpeg', 'ffprobe version 7.1 Copyright'],
		['ffprobe', 'Hello'],
	] as const)('finds no version for %s in %j', (tool, line) => {
		expect(parseToolVersion(tool, line)).toBeUndefined();
	});
});

describe('toolDefinitions', () => {
	it('defines every tool', () => {
		expect(Object.keys(toolDefinitions).toSorted()).toEqual([...toolNames].toSorted());
	});
});
