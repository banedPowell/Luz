// How the track details show measures. `null` stays unknown, so the page decides what to
// show instead.

/** A bitrate in bits per second as `320 kbps`. */
export function formatBitrate(bitrate: number | null): string | null {
	return bitrate === null ? null : `${Math.round(bitrate / 1000)} kbps`;
}

/** A sample rate in hertz as `44.1 kHz`. */
export function formatSampleRate(sampleRate: number | null): string | null {
	if (sampleRate === null) {
		return null;
	}
	// One decimal at most, none when it is zero: 44.1 kHz, 48 kHz
	return `${Number((sampleRate / 1000).toFixed(1))} kHz`;
}

/** A bit depth as `24-bit`. */
export function formatBitDepth(bitDepth: number | null): string | null {
	return bitDepth === null ? null : `${bitDepth}-bit`;
}

/** A channel count as `Mono`, `Stereo` or `6 channels`. */
export function formatChannels(channels: number | null): string | null {
	if (channels === null) {
		return null;
	}
	if (channels === 1) {
		return 'Mono';
	}
	return channels === 2 ? 'Stereo' : `${channels} channels`;
}

const fileSizeUnits = ['KB', 'MB', 'GB'] as const;

/** A file size in bytes, in decimal units as file managers show them: `4.2 MB`. */
export function formatFileSize(bytes: number): string {
	if (bytes < 1000) {
		return `${bytes} B`;
	}
	let value = bytes;
	let unit: (typeof fileSizeUnits)[number] = 'KB';
	for (const next of fileSizeUnits) {
		value /= 1000;
		unit = next;
		if (value < 1000) {
			break;
		}
	}
	return `${Number(value.toFixed(1))} ${unit}`;
}
