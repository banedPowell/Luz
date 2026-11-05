import { describe, expect, it } from 'vite-plus/test';

import {
	downloadedFiles,
	ffmetadataOf,
	ffmpegConvertArgs,
	ffmpegCoverArgs,
	outputFormatSchema,
	outputTarget,
	parseFfmpegProgressLine,
} from './download-format.ts';

describe('outputFormatSchema', () => {
	it.each(['source', 'mp3-128', 'mp3-192', 'mp3-256', 'mp3-320'])('accepts %j', (format) => {
		expect(outputFormatSchema.parse(format)).toBe(format);
	});

	it.each(['flac', 'mp3-64', 'MP3-320', '', null])('rejects %j', (format) => {
		expect(outputFormatSchema.safeParse(format).success).toBe(false);
	});
});

describe('outputTarget', () => {
	it.each([
		['Opus', { extension: '.opus', cover: 'picture-block' }],
		['OPUS', { extension: '.opus', cover: 'picture-block' }],
		['AAC', { extension: '.m4a', cover: 'stream' }],
		['MP3', { extension: '.mp3', cover: 'stream' }],
		['Vorbis', { extension: '.ogg', cover: 'picture-block' }],
	])('keeps a %s source in its own container', (codec, target) => {
		expect(outputTarget('source', codec)).toEqual(target);
	});

	it.each(['FLAC', 'ALAC', '', null, undefined])('has no container for a %j source', (codec) => {
		expect(outputTarget('source', codec)).toBeUndefined();
	});

	it('encodes to MP3 at the chosen bitrate, whatever the source', () => {
		expect(outputTarget('mp3-256', 'Opus')).toEqual({
			extension: '.mp3',
			mp3BitrateKbps: 256,
			cover: 'stream',
		});
	});
});

describe('downloadedFiles', () => {
	it('tells the audio from the thumbnail of an item', () => {
		expect(
			downloadedFiles(['7.webm', '7.cover.webp', '17.m4a', '8.webm', '7.webm.part'], '7'),
		).toEqual({ audio: '7.webm', thumbnail: '7.cover.webp' });
	});

	it('finds no audio while only an unfinished download is there', () => {
		expect(downloadedFiles(['7.webm.part', '7.webm.ytdl', '7.part'], '7')).toEqual({});
	});
});

const files = { audio: '/job/7.webm', metadata: '/job/7.ffmetadata', output: '/job/7.out.mp3' };

describe('ffmpegConvertArgs', () => {
	it('copies a source audio and puts the cover in the metadata', () => {
		const args = ffmpegConvertArgs(
			{ ...files, cover: '/job/7.square.jpg', output: '/job/7.out.opus' },
			{ extension: '.opus', cover: 'picture-block' },
		);

		expect(args).toEqual([
			'-hide_banner',
			'-nostdin',
			'-loglevel',
			'warning',
			'-y',
			'-nostats',
			'-progress',
			'pipe:1',
			'-i',
			'/job/7.webm',
			'-i',
			'/job/7.ffmetadata',
			'-map',
			'0:a:0',
			'-map_metadata',
			'1',
			'-map_metadata:s:a',
			'-1',
			'-map_chapters',
			'-1',
			'-c:a',
			'copy',
			'/job/7.out.opus',
		]);
	});

	it('encodes to MP3 with ID3v2.3 and the cover as an attached picture', () => {
		const args = ffmpegConvertArgs(
			{ ...files, cover: '/job/7.square.jpg' },
			{ extension: '.mp3', mp3BitrateKbps: 320, cover: 'stream' },
		);

		expect(args.slice(8)).toEqual([
			'-i',
			'/job/7.webm',
			'-i',
			'/job/7.ffmetadata',
			'-i',
			'/job/7.square.jpg',
			'-map',
			'0:a:0',
			'-map',
			'2:v:0',
			'-c:v',
			'copy',
			'-disposition:v:0',
			'attached_pic',
			'-map_metadata',
			'1',
			'-map_metadata:s:a',
			'-1',
			'-map_chapters',
			'-1',
			'-c:a',
			'libmp3lame',
			'-b:a',
			'320k',
			'-id3v2_version',
			'3',
			'/job/7.out.mp3',
		]);
	});

	it('maps no picture stream without a cover', () => {
		const args = ffmpegConvertArgs(
			{ ...files, output: '/job/7.out.m4a' },
			{ extension: '.m4a', cover: 'stream' },
		);

		expect(args).not.toContain('2:v:0');
		expect(args).toContain('copy');
	});
});

describe('ffmpegCoverArgs', () => {
	it('crops the thumbnail to its centred square, as a JPEG', () => {
		expect(ffmpegCoverArgs('/job/7.cover.webp', '/job/7.square.jpg')).toEqual([
			'-hide_banner',
			'-nostdin',
			'-loglevel',
			'warning',
			'-y',
			'-i',
			'/job/7.cover.webp',
			'-frames:v',
			'1',
			'-filter:v',
			"crop=w='min(iw,ih)':h='min(iw,ih)'",
			'-c:v',
			'mjpeg',
			'-q:v',
			'2',
			'-update',
			'1',
			'/job/7.square.jpg',
		]);
	});
});

describe('ffmetadataOf', () => {
	it('writes every known tag, escaped', () => {
		expect(
			ffmetadataOf({
				title: 'A = B; #1 \\ two\nlines',
				artists: ['Band', 'Guest'],
				album: 'Night Drive',
				albumArtist: 'Band',
				trackNumber: 3,
				discNumber: 1,
				year: 2024,
				genre: 'Synthwave',
			}),
		).toBe(
			[
				';FFMETADATA1',
				'title=A \\= B\\; \\#1 \\\\ two\\',
				'lines',
				'artist=Band, Guest',
				'album=Night Drive',
				'album_artist=Band',
				'track=3',
				'disc=1',
				'date=2024',
				'genre=Synthwave',
				'',
			].join('\n'),
		);
	});

	it('leaves out the missing tags and adds the picture block', () => {
		expect(ffmetadataOf({ title: 'Solo', artists: [] }, 'AAAA==')).toBe(
			';FFMETADATA1\ntitle=Solo\nMETADATA_BLOCK_PICTURE=AAAA\\=\\=\n',
		);
	});
});

describe('parseFfmpegProgressLine', () => {
	it('gives the percent of the duration converted', () => {
		expect(parseFfmpegProgressLine('out_time_us=45000000', 180_000)).toBe(25);
		expect(parseFfmpegProgressLine('out_time_us=999999999', 180_000)).toBe(100);
	});

	it('ends at 100, even without a duration', () => {
		expect(parseFfmpegProgressLine('progress=end')).toBe(100);
	});

	it.each([
		['out_time_us=45000000', undefined],
		['out_time_us=N/A', 180_000],
		['progress=continue', 180_000],
		['speed=12x', 180_000],
		['[mp3 @ 0x1] warning', 180_000],
	])('ignores %j with a duration of %j', (line, durationMs) => {
		expect(parseFfmpegProgressLine(line, durationMs)).toBeUndefined();
	});
});
