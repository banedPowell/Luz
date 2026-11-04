import { describe, expect, it } from 'vitest';

import { albumQuality, codecName, isLosslessCodec, trackAudioOf } from './quality.ts';

describe('codecName', () => {
	it.each([
		['FLAC', 'FLAC'],
		['ALAC', 'ALAC'],
		['PCM', 'PCM'],
		['MPEG-4/AAC', 'AAC'],
		['MPEG/AAC', 'AAC'],
		['MPEG 1 Layer 3', 'MP3'],
		['MPEG 2.5 Layer 3', 'MP3'],
		['MPEG 1 Layer 2', 'MP2'],
		['Vorbis I', 'Vorbis'],
		['Opus', 'Opus'],
		['  WavPack ', 'WavPack'],
	])('names %s %s', (codec, name) => {
		expect(codecName(codec)).toBe(name);
	});

	it('returns null without a codec', () => {
		expect(codecName(undefined)).toBeNull();
		expect(codecName(' ')).toBeNull();
	});
});

describe('trackAudioOf', () => {
	// WAV and AIFF hold PCM; ALAC and AAC share the .m4a extension
	it.each(['FLAC', 'ALAC', 'PCM'])('counts %s as lossless', (codec) => {
		expect(trackAudioOf(codec)).toEqual({ codec, lossless: true });
	});

	it.each([
		['MPEG-4/AAC', 'AAC'],
		['MPEG 1 Layer 3', 'MP3'],
		['Vorbis I', 'Vorbis'],
		['Opus', 'Opus'],
	])('counts %s as lossy', (codec, name) => {
		expect(trackAudioOf(codec)).toEqual({ codec: name, lossless: false });
	});

	it('counts an unknown codec as lossy', () => {
		expect(trackAudioOf(undefined)).toEqual({ codec: null, lossless: false });
		expect(isLosslessCodec('Something new')).toBe(false);
	});
});

describe('albumQuality', () => {
	it('is lossless when every track is', () => {
		expect(albumQuality({ trackCount: 3, losslessCount: 3, unknownCount: 0 })).toBe('lossless');
	});

	it('is mixed as soon as one track is lossy', () => {
		expect(albumQuality({ trackCount: 3, losslessCount: 2, unknownCount: 0 })).toBe('mixed');
	});

	it('is mixed when no track is lossless', () => {
		expect(albumQuality({ trackCount: 2, losslessCount: 0, unknownCount: 0 })).toBe('mixed');
	});

	it('is unknown while a track was not read since codecs are stored', () => {
		expect(albumQuality({ trackCount: 3, losslessCount: 2, unknownCount: 1 })).toBeNull();
	});

	it('is unknown for an album without tracks', () => {
		expect(albumQuality({ trackCount: 0, losslessCount: 0, unknownCount: 0 })).toBeNull();
	});
});
