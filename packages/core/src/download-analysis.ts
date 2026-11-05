import { z } from 'zod';

import type { TrackTags } from './library.ts';

/**
 * What a URL holds before anything is downloaded: the output of
 * `yt-dlp --dump-single-json --flat-playlist`, reduced to what Luz uses and mapped to
 * the tags Luz will write. Pure: running yt-dlp is the server adapter's job.
 */

const httpUrl = z.url({
	protocol: /^https?$/,
	error: 'Enter a web address starting with http:// or https://',
});

export const analyzeRequestSchema = z.strictObject({
	url: z.string().trim().min(1, 'Enter a URL').pipe(httpUrl),
});

export type AnalyzeRequest = z.infer<typeof analyzeRequestSchema>;

// yt-dlp writes null for a field it knows about but could not fill, so every field is nullish
const nullableText = z.string().nullish();
const count = z.number().int().positive().nullish();
const seconds = z.number().nonnegative().nullish();
const thumbnails = z.array(z.object({ url: z.string() })).nullish();

const ytDlpTrackFields = {
	id: z.string(),
	title: nullableText,
	track: nullableText,
	artist: nullableText,
	artists: z.array(z.string()).nullish(),
	album: nullableText,
	album_artist: nullableText,
	track_number: count,
	disc_number: count,
	release_year: z.number().int().nullish(),
	uploader: nullableText,
	channel: nullableText,
	duration: seconds,
	thumbnail: nullableText,
	thumbnails,
	url: nullableText,
	webpage_url: nullableText,
};

const ytDlpEntrySchema = z.object(ytDlpTrackFields);

/** The part of yt-dlp's JSON Luz reads; unknown fields are dropped. */
export const ytDlpInfoSchema = z.object({
	...ytDlpTrackFields,
	_type: nullableText,
	// A flat playlist lists entries that may be null when yt-dlp could not read them
	entries: z.array(ytDlpEntrySchema.nullable()).nullish(),
});

export type YtDlpInfo = z.infer<typeof ytDlpInfoSchema>;
type YtDlpEntry = z.infer<typeof ytDlpEntrySchema>;

export type AnalyzedKind = 'track' | 'playlist';

/** One file a download will produce, before its path in the library is known. */
export interface AnalyzedItem {
	sourceId: string;
	/** The page of the item, when yt-dlp gave one. */
	url?: string;
	/** Kept for the cover (#84); nothing is fetched at analysis time. */
	thumbnailUrl?: string;
	tags: TrackTags;
}

export interface AnalyzedSource {
	kind: AnalyzedKind;
	title: string;
	items: AnalyzedItem[];
}

/** An item of the preview, with where it will land in the library. */
export interface PreviewItem extends AnalyzedItem {
	/**
	 * The path relative to the library folder, joined with `/`, without the extension:
	 * the extension depends on the output format chosen when the download starts (#84).
	 */
	pathWithoutExtension: string;
	/** A file with this path and any audio extension is already in the library. */
	alreadyInLibrary: boolean;
}

export interface DownloadPreview {
	kind: AnalyzedKind;
	title: string;
	items: PreviewItem[];
}

function clean(value: string | null | undefined): string | undefined {
	const trimmed = value?.trim();
	return trimmed === undefined || trimmed === '' ? undefined : trimmed;
}

// YouTube names the channels it generates for an artist's releases "<Artist> - Topic"
function uploaderName(value: string | null | undefined): string | undefined {
	return clean(value?.replace(/ - Topic$/, ''));
}

function artistsOf(entry: YtDlpEntry): string[] {
	const artists = (entry.artists ?? []).map(clean).filter((name) => name !== undefined);
	if (artists.length > 0) {
		return artists;
	}
	const artist =
		clean(entry.artist) ?? uploaderName(entry.uploader) ?? uploaderName(entry.channel);
	return artist === undefined ? [] : [artist];
}

function thumbnailOf(entry: YtDlpEntry): string | undefined {
	// yt-dlp lists thumbnails from the smallest to the largest
	return clean(entry.thumbnail) ?? clean(entry.thumbnails?.at(-1)?.url);
}

interface PlaylistContext {
	album: string | undefined;
	trackNumber: number;
}

/**
 * The tags of one item as Luz will write them: the music fields of yt-dlp when the site
 * gives them, otherwise the title, the uploader as artist and, inside a playlist, the
 * playlist title as album and the position as track number.
 */
export function tagsFromYtDlp(entry: YtDlpEntry, playlist?: PlaylistContext): TrackTags {
	// Absent rather than undefined: a tag is either known or missing (exactOptionalPropertyTypes)
	const title = clean(entry.track) ?? clean(entry.title);
	const album = clean(entry.album) ?? playlist?.album;
	const albumArtist = clean(entry.album_artist);
	const trackNumber = entry.track_number ?? playlist?.trackNumber;
	return {
		...(title === undefined ? {} : { title }),
		artists: artistsOf(entry),
		...(album === undefined ? {} : { album }),
		...(albumArtist === undefined ? {} : { albumArtist }),
		...(trackNumber === undefined ? {} : { trackNumber }),
		...(entry.disc_number == null ? {} : { discNumber: entry.disc_number }),
		...(entry.release_year == null ? {} : { year: entry.release_year }),
		...(entry.duration == null ? {} : { durationMs: Math.round(entry.duration * 1000) }),
	};
}

function itemOf(entry: YtDlpEntry, playlist?: PlaylistContext): AnalyzedItem {
	const url = clean(entry.webpage_url) ?? clean(entry.url);
	const thumbnailUrl = thumbnailOf(entry);
	return {
		sourceId: entry.id,
		...(url === undefined ? {} : { url }),
		...(thumbnailUrl === undefined ? {} : { thumbnailUrl }),
		tags: tagsFromYtDlp(entry, playlist),
	};
}

/** A track or a playlist, with one item per file a download would produce. */
export function analyzedSourceFromYtDlp(info: YtDlpInfo): AnalyzedSource {
	// Renamed while destructured: "_type" is yt-dlp's name, not ours
	const { _type: type, entries } = info;
	const title = clean(info.title) ?? info.id;
	if (type !== 'playlist' || !entries) {
		return { kind: 'track', title, items: [itemOf(info)] };
	}
	const album = clean(info.title);
	const items = entries.flatMap((entry, index) =>
		// Numbered by position in the playlist, so a missing entry leaves a gap, not a shift
		entry === null ? [] : [itemOf(entry, { album, trackNumber: index + 1 })],
	);
	return { kind: 'playlist', title, items };
}

export type AnalysisErrorReason =
	| 'library-path-unset'
	| 'tool-unavailable'
	| 'unsupported-url'
	| 'unavailable'
	| 'network'
	| 'timed-out'
	| 'failed';

/** What the user reads for each failure; the yt-dlp output stays behind "Show details". */
export const analysisErrorMessages: Record<AnalysisErrorReason, string> = {
	'library-path-unset': 'Choose your music library folder in Settings before downloading.',
	'tool-unavailable': 'yt-dlp is not available. See the Tools section of Settings.',
	'unsupported-url': 'This address is not supported: no music could be found there.',
	unavailable: 'This video or playlist is private, removed or not available in your country.',
	network: 'The site could not be reached. Check your internet connection and try again.',
	'timed-out': 'The site took too long to answer. Try again later.',
	failed: 'yt-dlp could not read this address.',
};

// Checked in order: a removed video can also mention a 404 or a failed web page
const errorPatterns: [AnalysisErrorReason, RegExp][] = [
	['unsupported-url', /Unsupported URL|is not a valid URL/i],
	[
		'unavailable',
		/Private video|Video unavailable|has been removed|account .* terminated|not available in your country|members-only|Sign in to confirm your age|HTTP Error (?:403|404|410)|does not exist/i,
	],
	[
		'network',
		/Unable to download (?:webpage|API page|JSON)|getaddrinfo|Failed to resolve|Name or service not known|Connection (?:refused|reset)|Network is unreachable|timed out|Temporary failure in name resolution|SSL|urlopen error/i,
	],
];

/** The reason of a failed analysis, read from the error lines yt-dlp printed. */
export function classifyYtDlpError(stderrLines: readonly string[]): AnalysisErrorReason {
	const errors = stderrLines.filter((line) => line.startsWith('ERROR:'));
	const text = (errors.length > 0 ? errors : stderrLines).join('\n');
	return errorPatterns.find(([, pattern]) => pattern.test(text))?.[0] ?? 'failed';
}
