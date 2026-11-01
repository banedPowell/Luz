import { describe, expect, it } from 'vitest';

import { readConfig } from '../../server/infrastructure/config';
import type { DataDirectoryContext } from '../../server/infrastructure/data-directory';

const context: DataDirectoryContext = {
	platform: 'linux',
	env: {},
	homeDir: '/home/ada',
	cwd: '/home/ada/luz',
};

// Shaped like Nuxt's runtime config, which also carries keys Luz does not own
const runtimeConfig = {
	app: { baseURL: '/' },
	nitro: { envPrefix: 'NUXT_' },
	public: {},
	dataDir: '',
	ytDlpPath: 'yt-dlp',
	ffmpegPath: 'ffmpeg',
	ffprobePath: 'ffprobe',
};

describe('readConfig', () => {
	it('resolves the default data directory and keeps the tool paths', () => {
		expect(readConfig(runtimeConfig, context)).toEqual({
			dataDir: '/home/ada/.local/share/luz',
			ytDlpPath: 'yt-dlp',
			ffmpegPath: 'ffmpeg',
			ffprobePath: 'ffprobe',
		});
	});

	it('resolves a configured data directory', () => {
		expect(readConfig({ ...runtimeConfig, dataDir: '.luz' }, context).dataDir).toBe(
			'/home/ada/luz/.luz',
		);
	});

	it('names the faulty variable in the error', () => {
		expect(() => readConfig({ ...runtimeConfig, ffmpegPath: '' }, context)).toThrow(
			/NUXT_\* environment variables:\n- ffmpegPath:/,
		);
	});

	it('rejects a value that destr turned into a number', () => {
		expect(() => readConfig({ ...runtimeConfig, dataDir: 2026 }, context)).toThrow(/dataDir/);
	});
});
