/**
 * The audio of a track, as opposed to its tags: the codec, and whether it keeps every bit
 * of the source. Read from the file, like the tags, so a rescan can rebuild it.
 */
export interface TrackAudio {
	// `null` when the file does not name its codec
	codec: string | null;
	lossless: boolean;
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

/** The audio of a track from the codec its file reports. */
export function trackAudioOf(codec: string | undefined): TrackAudio {
	const name = codecName(codec);
	return { codec: name, lossless: isLosslessCodec(name) };
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
