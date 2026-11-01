/**
 * What a library scan did, in audio files: new ones indexed, changed ones read again,
 * tracks removed because their file is gone, files left as they were, and files skipped
 * because their tags could not be read.
 */
export interface ScanSummary {
	added: number;
	updated: number;
	removed: number;
	unchanged: number;
	skipped: number;
}

export const scanErrorReasons = [
	'library-path-unset',
	'library-path-missing',
	'scan-running',
] as const;

/** Why a scan could not start, sent by the API so the page can explain it. */
export type ScanErrorReason = (typeof scanErrorReasons)[number];

/** Narrows an unknown value, such as an API error payload, to a scan error reason. */
export function isScanErrorReason(value: unknown): value is ScanErrorReason {
	return scanErrorReasons.some((reason) => reason === value);
}
