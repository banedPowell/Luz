import { describe, expect, it } from 'vitest';

import {
	analyzeRequestSchema,
	analyzedSourceFromYtDlp,
	classifyYtDlpError,
	tagsFromYtDlp,
	ytDlpInfoSchema,
} from './download-analysis.ts';
import { renderTrackPath, renderTrackPathWithoutExtension } from './naming.ts';

describe('analyze request', () => {
	it('accepts http and https URLs, trimmed', () => {
		expect(analyzeRequestSchema.parse({ url: ' https://example.com/watch?v=1 ' })).toEqual({
			url: 'https://example.com/watch?v=1',
		});
		expect(analyzeRequestSchema.safeParse({ url: 'http://example.com' }).success).toBe(true);
	});

	it.each([
		'',
		'example.com',
		'file:///etc/passwd',
		'ftp://example.com',
		'--exec=rm',
		'javascript:x',
	])('rejects %j', (url) => {
		expect(analyzeRequestSchema.safeParse({ url }).success).toBe(false);
	});

	it('rejects unknown keys', () => {
		expect(analyzeRequestSchema.safeParse({ url: 'https://a.b', extra: 1 }).success).toBe(
			false,
		);
	});
});

describe('tags from yt-dlp', () => {
	it('prefers the music fields when the site gives them', () => {
		expect(
			tagsFromYtDlp({
				id: 'x',
				title: 'Daft Punk - Digital Love (Official Audio)',
				track: 'Digital Love',
				artists: ['Daft Punk', ' '],
				artist: 'Ignored',
				album: 'Discovery',
				album_artist: 'Daft Punk',
				track_number: 3,
				disc_number: 1,
				release_year: 2001,
				uploader: 'Someone',
				duration: 301.4,
			}),
		).toEqual({
			title: 'Digital Love',
			artists: ['Daft Punk'],
			album: 'Discovery',
			albumArtist: 'Daft Punk',
			trackNumber: 3,
			discNumber: 1,
			year: 2001,
			durationMs: 301_400,
		});
	});

	it('falls back on the title, the uploader without " - Topic" and the playlist', () => {
		expect(
			tagsFromYtDlp(
				{ id: 'x', title: 'Aerodynamic', uploader: null, channel: 'Daft Punk - Topic' },
				{ album: 'Discovery', trackNumber: 2 },
			),
		).toEqual({
			title: 'Aerodynamic',
			artists: ['Daft Punk'],
			album: 'Discovery',
			trackNumber: 2,
		});
	});

	it('uses the artist field before the uploader', () => {
		expect(tagsFromYtDlp({ id: 'x', artist: 'Air', uploader: 'Label' }).artists).toEqual([
			'Air',
		]);
	});

	it('leaves the tags empty when yt-dlp knows nothing', () => {
		expect(tagsFromYtDlp({ id: 'x' })).toEqual({ artists: [] });
	});
});

describe('analysed source', () => {
	it('reads a single video as one track', () => {
		const info = ytDlpInfoSchema.parse({
			id: 'abc',
			_type: 'video',
			title: 'Song',
			uploader: 'Artist',
			thumbnail: 'https://img/abc.jpg',
			webpage_url: 'https://site/abc',
			formats: [{ ext: 'webm' }],
		});
		expect(analyzedSourceFromYtDlp(info)).toEqual({
			kind: 'track',
			title: 'Song',
			items: [
				{
					sourceId: 'abc',
					url: 'https://site/abc',
					thumbnailUrl: 'https://img/abc.jpg',
					tags: { title: 'Song', artists: ['Artist'] },
				},
			],
		});
	});

	it('numbers playlist entries by position and keeps the largest thumbnail', () => {
		const info = ytDlpInfoSchema.parse({
			id: 'pl',
			_type: 'playlist',
			title: 'Mix',
			entries: [
				{
					id: 'a',
					title: 'A',
					url: 'https://site/a',
					thumbnails: [{ url: 'small' }, { url: 'large' }],
				},
				null,
				{ id: 'c', title: 'C' },
			],
		});
		const source = analyzedSourceFromYtDlp(info);
		expect(source.kind).toBe('playlist');
		expect(source.title).toBe('Mix');
		expect(source.items.map((item) => [item.sourceId, item.tags.trackNumber])).toEqual([
			['a', 1],
			['c', 3],
		]);
		expect(source.items[0]?.thumbnailUrl).toBe('large');
		expect(source.items[0]?.tags.album).toBe('Mix');
	});

	it('names a source without a title after its id', () => {
		expect(
			analyzedSourceFromYtDlp(ytDlpInfoSchema.parse({ id: 'abc', title: null })).title,
		).toBe('abc');
	});
});

describe('yt-dlp errors', () => {
	it.each([
		['ERROR: Unsupported URL: https://example.com/', 'unsupported-url'],
		[
			'ERROR: [youtube] x: Private video. Sign in if you have been granted access',
			'unavailable',
		],
		['ERROR: [youtube] x: Video unavailable. This video has been removed', 'unavailable'],
		[
			'ERROR: [youtube] x: Unable to download webpage: <urlopen error [Errno 11001] getaddrinfo failed>',
			'network',
		],
		['ERROR: [generic] Unable to download webpage: HTTP Error 404: Not Found', 'unavailable'],
		['ERROR: something new', 'failed'],
	] as const)('reads %j as %s', (line, reason) => {
		expect(classifyYtDlpError(['[youtube] x: Downloading webpage', line])).toBe(reason);
	});

	it('reads every line when none starts with ERROR:', () => {
		expect(classifyYtDlpError(['Traceback', 'socket: Connection refused'])).toBe('network');
	});
});

describe('path without extension', () => {
	it('gives the path of renderTrackPath once an extension is added', () => {
		const template = '{albumartist}/{album}/{track:02} {title}';
		for (const title of ['Digital Love', 'é'.repeat(200), 'a'.repeat(400)]) {
			const tags = { title, artists: ['Daft Punk'], album: 'Discovery', trackNumber: 3 };
			const stem = renderTrackPathWithoutExtension(template, tags);
			for (const extension of ['opus', 'm4a', 'mp3', 'flac']) {
				expect(renderTrackPath(template, tags, extension)).toBe(`${stem}.${extension}`);
			}
		}
	});
});
