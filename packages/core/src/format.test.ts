import { describe, expect, it } from 'vitest';

import {
	formatBitDepth,
	formatBitrate,
	formatChannels,
	formatFileSize,
	formatSampleRate,
} from './format.ts';

describe('track detail formats', () => {
	it('shows a bitrate in kbps', () => {
		expect(formatBitrate(320_000)).toBe('320 kbps');
		expect(formatBitrate(1_411_200)).toBe('1411 kbps');
		expect(formatBitrate(245_872)).toBe('246 kbps');
		expect(formatBitrate(null)).toBeNull();
	});

	it('shows a sample rate in kHz with one decimal at most', () => {
		expect(formatSampleRate(44_100)).toBe('44.1 kHz');
		expect(formatSampleRate(48_000)).toBe('48 kHz');
		expect(formatSampleRate(192_000)).toBe('192 kHz');
		expect(formatSampleRate(null)).toBeNull();
	});

	it('shows a bit depth', () => {
		expect(formatBitDepth(24)).toBe('24-bit');
		expect(formatBitDepth(null)).toBeNull();
	});

	it('names mono and stereo, and counts other layouts', () => {
		expect(formatChannels(1)).toBe('Mono');
		expect(formatChannels(2)).toBe('Stereo');
		expect(formatChannels(6)).toBe('6 channels');
		expect(formatChannels(null)).toBeNull();
	});

	it('shows a file size in decimal units', () => {
		expect(formatFileSize(512)).toBe('512 B');
		expect(formatFileSize(1_000)).toBe('1 KB');
		expect(formatFileSize(4_234_567)).toBe('4.2 MB');
		expect(formatFileSize(1_500_000_000)).toBe('1.5 GB');
		expect(formatFileSize(2_000_000_000_000)).toBe('2000 GB');
	});
});
