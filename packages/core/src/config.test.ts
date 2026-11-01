import { describe, expect, it } from 'vite-plus/test';

import { serverConfigSchema } from './config.ts';

const valid = {
	dataDir: '',
	ytDlpPath: 'yt-dlp',
	ffmpegPath: 'ffmpeg',
	ffprobePath: 'ffprobe',
};

describe('serverConfigSchema', () => {
	it('accepts the defaults', () => {
		expect(serverConfigSchema.parse(valid)).toEqual(valid);
	});

	it('trims every value', () => {
		expect(
			serverConfigSchema.parse({
				dataDir: '  /srv/luz ',
				ytDlpPath: ' /usr/bin/yt-dlp ',
				ffmpegPath: ' ffmpeg ',
				ffprobePath: ' ffprobe ',
			}),
		).toEqual({
			dataDir: '/srv/luz',
			ytDlpPath: '/usr/bin/yt-dlp',
			ffmpegPath: 'ffmpeg',
			ffprobePath: 'ffprobe',
		});
	});

	it('treats a blank data directory as unset', () => {
		expect(serverConfigSchema.parse({ ...valid, dataDir: '   ' }).dataDir).toBe('');
	});

	it.each(['ytDlpPath', 'ffmpegPath', 'ffprobePath'])('rejects a blank %s', (key) => {
		expect(serverConfigSchema.safeParse({ ...valid, [key]: ' ' }).success).toBe(false);
	});

	// Nuxt casts environment values with destr, so NUXT_DATA_DIR=123 arrives as a number
	it.each([{ dataDir: 123 }, { ffmpegPath: true }, { ytDlpPath: undefined }])(
		'rejects a non-string value %j',
		(override) => {
			expect(serverConfigSchema.safeParse({ ...valid, ...override }).success).toBe(false);
		},
	);
});
