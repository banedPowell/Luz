/**
 * The audio of a track, as opposed to its tags: the codec, and whether it keeps every bit
 * of the source. Read from the file, like the tags, so a rescan can rebuild it.
 */
export interface TrackAudio {
	// `null` when the file does not name its codec, and for every value the file does not give
	codec: string | null;
	// How the codec was used, e.g. "CBR" or "V0" for an MP3
	codecProfile: string | null;
	lossless: boolean;
	// Bits per second, averaged over the file
	bitrate: number | null;
	// Hertz
	sampleRate: number | null;
	// Bits per sample; only lossless and some AAC files give one
	bitDepth: number | null;
	channels: number | null;
}

/** The audio format as the tag reader reports it (music-metadata's names). */
export interface AudioFormat {
	codec?: string;
	codecProfile?: string;
	bitrate?: number;
	sampleRate?: number;
	bitsPerSample?: number;
	numberOfChannels?: number;
}

// The names music-metadata gives the lossy codecs Luz reads, shortened to what users know.
// A codec missing here keeps the name the file gives.
const codecNames: [pattern: RegExp, name: string][] = [
	[/^MPEG(-4)?\/AAC/i, 'AAC'],
	[/^MPEG .*Layer 3$/i, 'MP3'],
	[/^MPEG .*Layer 2$/i, 'MP2'],
	[/^Vorbis/i, 'Vorbis'],
];

/** The short name of a codec as the tag reader reports it, or `null` when there is none. */
export function codecName(codec: string | undefined): string | null {
	const trimmed = codec?.trim();
	if (!trimmed) {
		return null;
	}
	return codecNames.find(([pattern]) => pattern.test(trimmed))?.[1] ?? trimmed;
}

/**
 * The codecs that keep every bit of the source: FLAC, ALAC (which shares the `.m4a`
 * extension with lossy AAC, hence a rule on the codec, not the file name) and the
 * uncompressed PCM of WAV and AIFF files.
 */
export const losslessCodecs = ['FLAC', 'ALAC', 'PCM'] as const;

/** Whether a codec, as `codecName` returns it, is lossless. */
export function isLosslessCodec(codec: string | null): boolean {
	return losslessCodecs.some((lossless) => lossless === codec);
}

// Files hold 0, fractions or garbage: keep a positive whole number, or nothing
function measure(value: number | undefined): number | null {
	return value !== undefined && Number.isFinite(value) && value > 0 ? Math.round(value) : null;
}

/** The audio of a track from the format its file reports. */
export function trackAudioOf(format: AudioFormat): TrackAudio {
	const codec = codecName(format.codec);
	return {
		codec,
		codecProfile: format.codecProfile?.trim() || null,
		lossless: isLosslessCodec(codec),
		bitrate: measure(format.bitrate),
		sampleRate: measure(format.sampleRate),
		bitDepth: measure(format.bitsPerSample),
		channels: measure(format.numberOfChannels),
	};
}

export const albumQualities = ['lossless', 'mixed'] as const;

/** What the quality badge of an album says. */
export type AlbumQuality = (typeof albumQualities)[number];

/** How many tracks of an album are lossless, and how many were indexed before Luz read their codec. */
export interface AlbumTrackQualities {
	trackCount: number;
	losslessCount: number;
	unknownCount: number;
}

/**
 * "Lossless" when every track of the album is, "Mixed" as soon as one is not. `null` while
 * a track's codec is unknown (indexed before Luz read codecs, until the next scan): a badge
 * guessed from the other tracks could be wrong.
 */
export function albumQuality({
	trackCount,
	losslessCount,
	unknownCount,
}: AlbumTrackQualities): AlbumQuality | null {
	if (trackCount === 0 || unknownCount > 0) {
		return null;
	}
	return losslessCount === trackCount ? 'lossless' : 'mixed';
}

export const albumQualityLabels: Record<AlbumQuality, string> = {
	lossless: 'Lossless',
	mixed: 'Mixed',
};
