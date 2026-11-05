import type { TrackSummary } from '@luz/core';

// Untagged values are grouped under an "unknown" entry (see @luz/core); these name it

export function albumTitle(title: string | null): string {
	return title ?? 'Unknown album';
}

export function artistName(name: string | null): string {
	return name ?? 'Unknown artist';
}

export function trackTitle(track: Pick<TrackSummary, 'title' | 'fileName'>): string {
	return track.title ?? track.fileName;
}

/** The artist a track list shows: the track artists, else the artist of its album. */
export function trackArtists(track: Pick<TrackSummary, 'artists' | 'artist'>): string {
	return track.artists ?? artistName(track.artist.name);
}

export function plural(count: number, word: string): string {
	return `${count} ${word}${count === 1 ? '' : 's'}`;
}

const addedFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

/** The day a scan first indexed a track; empty for a track indexed before it was stored. */
export function formatAdded(addedAtMs: number | null): string {
	return addedAtMs === null ? '' : addedFormat.format(addedAtMs);
}
