import { z } from 'zod';

import { formatArtists, type TrackTags } from './library.ts';

/**
 * The format a download ends in, and the FFmpeg arguments that produce it (#84). Pure: the
 * adapter runs FFmpeg, these functions only say how.
 */

/**
 * The source audio as yt-dlp gives it, never re-encoded, or MP3 at a chosen bitrate. No
 * lossless target: converting a lossy source to one makes files bigger, not better.
 */
export const outputFormats = ['source', 'mp3-128', 'mp3-192', 'mp3-256', 'mp3-320'] as const;

export const outputFormatSchema = z.enum(outputFormats);

export type OutputFormat = z.infer<typeof outputFormatSchema>;

export const defaultOutputFormat: OutputFormat = 'source';

/** What the user reads for each format. */
export const outputFormatLabels: Record<OutputFormat, string> = {
	source: 'Source audio, as is',
	'mp3-128': 'MP3, 128 kbit/s',
	'mp3-192': 'MP3, 192 kbit/s',
	'mp3-256': 'MP3, 256 kbit/s',
	'mp3-320': 'MP3, 320 kbit/s',
};

/**
 * How a cover goes into the file: as an attached picture stream (MP3, M4A), or as a
 * METADATA_BLOCK_PICTURE comment, since FFmpeg's Ogg muxer takes no picture stream.
 */
export type CoverEmbedding = 'stream' | 'picture-block';

export interface OutputTarget {
	/** With its dot, lowercase. */
	extension: string;
	/** Set when the audio is encoded to MP3; absent when it is copied as is. */
	mp3BitrateKbps?: number;
	cover: CoverEmbedding;
}

// The containers of the codecs a source keeps, by codecName() of the tag reader
const sourceTargets: Record<string, OutputTarget> = {
	opus: { extension: '.opus', cover: 'picture-block' },
	aac: { extension: '.m4a', cover: 'stream' },
	mp3: { extension: '.mp3', cover: 'stream' },
	vorbis: { extension: '.ogg', cover: 'picture-block' },
};

/**
 * Where an item's audio goes. For the source format, the codec of the downloaded file picks
 * the container; undefined when Luz has none for it.
 */
export function outputTarget(
	format: OutputFormat,
	sourceCodec?: string | null,
): OutputTarget | undefined {
	if (format === 'source') {
		return sourceTargets[sourceCodec?.trim().toLowerCase() ?? ''];
	}
	return {
		extension: '.mp3',
		mp3BitrateKbps: Number(format.slice('mp3-'.length)),
		cover: 'stream',
	};
}

/** The suffix of the thumbnail yt-dlp writes beside the audio: `<stem>.cover.<ext>`. */
export const thumbnailSuffix = '.cover';

// Left by an unfinished download, never a file to convert
const unfinishedExtensions = new Set(['part', 'ytdl', 'temp']);

/** The audio and the thumbnail yt-dlp wrote for one item, among the files of the job folder. */
export function downloadedFiles(
	fileNames: readonly string[],
	fileStem: string,
): { audio?: string; thumbnail?: string } {
	const files: { audio?: string; thumbnail?: string } = {};
	for (const name of fileNames) {
		if (!name.startsWith(`${fileStem}.`)) {
			continue;
		}
		const rest = name.slice(fileStem.length + 1).split('.');
		if (rest.length === 1 && rest[0] !== '' && !unfinishedExtensions.has(rest[0] ?? '')) {
			files.audio = name;
		} else if (rest.length === 2 && `.${rest[0]}` === thumbnailSuffix && rest[1] !== '') {
			files.thumbnail = name;
		}
	}
	return files;
}

// FFmpeg reports problems, not its banner nor a status line on stderr
const quiet = ['-hide_banner', '-nostdin', '-loglevel', 'warning', '-y'];

/** Crops a thumbnail to its centred square and writes it as a JPEG. */
export function ffmpegCoverArgs(input: string, output: string): string[] {
	return [
		...quiet,
		'-i',
		input,
		'-frames:v',
		'1',
		// The quotes keep the commas from splitting the filter graph; no shell reads them
		'-filter:v',
		"crop=w='min(iw,ih)':h='min(iw,ih)'",
		'-c:v',
		'mjpeg',
		'-q:v',
		'2',
		'-update',
		'1',
		output,
	];
}

export interface ConvertFiles {
	audio: string;
	/** The tags, written by ffmetadataOf(). */
	metadata: string;
	/** The square JPEG, embedded as a stream; a picture block goes in the metadata instead. */
	cover?: string;
	output: string;
}

/**
 * Copies or encodes the audio, replaces every tag with those of the metadata file and embeds
 * the cover, in one pass. Progress goes to stdout as key=value lines.
 */
export function ffmpegConvertArgs(files: ConvertFiles, target: OutputTarget): string[] {
	const cover = target.cover === 'stream' ? files.cover : undefined;
	return [
		...quiet,
		'-nostats',
		'-progress',
		'pipe:1',
		'-i',
		files.audio,
		'-i',
		files.metadata,
		...(cover === undefined ? [] : ['-i', cover]),
		'-map',
		'0:a:0',
		...(cover === undefined
			? []
			: ['-map', '2:v:0', '-c:v', 'copy', '-disposition:v:0', 'attached_pic']),
		// Only our tags: the source's own (encoder, comments, chapters) are dropped
		'-map_metadata',
		'1',
		'-map_metadata:s:a',
		'-1',
		'-map_chapters',
		'-1',
		...(target.mp3BitrateKbps === undefined
			? ['-c:a', 'copy']
			: ['-c:a', 'libmp3lame', '-b:a', `${target.mp3BitrateKbps}k`]),
		// ID3v2.3 rather than FFmpeg's 2.4: more players read it, Windows Explorer among them
		...(target.extension === '.mp3' ? ['-id3v2_version', '3'] : []),
		files.output,
	];
}

/**
 * The tags of an item as an FFmpeg metadata file. A file rather than arguments, so a long
 * value (a picture block) stays clear of the command line limit of Windows.
 */
export function ffmetadataOf(tags: TrackTags, pictureBlock?: string): string {
	const entries: [string, string | number | null | undefined][] = [
		['title', tags.title],
		['artist', formatArtists(tags.artists)],
		['album', tags.album],
		['album_artist', tags.albumArtist],
		['track', tags.trackNumber],
		['disc', tags.discNumber],
		['date', tags.year],
		['genre', tags.genre],
		['METADATA_BLOCK_PICTURE', pictureBlock],
	];
	const lines = entries
		.filter((entry): entry is [string, string | number] => entry[1] != null && entry[1] !== '')
		.map(([key, value]) => `${key}=${escapeMetadata(String(value))}`);
	return [';FFMETADATA1', ...lines, ''].join('\n');
}

// The characters the ffmetadata format gives a meaning to
function escapeMetadata(value: string): string {
	return value.replace(/[=;#\\\n]/g, (character) => `\\${character}`);
}

/**
 * The percent of a conversion from a line of `-progress pipe:1`, given the duration of the
 * track. Undefined for any other line, and while the duration is unknown, except at the end.
 */
export function parseFfmpegProgressLine(line: string, durationMs?: number): number | undefined {
	const [key, value] = line.trim().split('=', 2);
	if (key === 'progress' && value === 'end') {
		return 100;
	}
	if (key !== 'out_time_us' || durationMs === undefined || durationMs <= 0) {
		return undefined;
	}
	const microseconds = Number(value);
	if (!Number.isFinite(microseconds) || microseconds < 0) {
		return undefined;
	}
	// Microseconds over milliseconds: one percent is ten times the duration
	return Math.min(100, Math.floor(microseconds / (10 * durationMs)));
}
