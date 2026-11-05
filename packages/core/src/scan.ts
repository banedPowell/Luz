import { z } from 'zod';

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

/**
 * The most albums or tracks one scan request can name: a request stays small, and the ids
 * fit in one query whatever SQLite's limit on bound parameters.
 */
export const maxScanIds = 500;

const scanIds = z.array(z.number().int().positive()).min(1).max(maxScanIds);

const scanPaths = z.array(z.string().trim().min(1)).min(1).max(maxScanIds);

/**
 * What a scan looks at: the whole library folder, only the tracks already indexed in some
 * albums or under some ids, or some files of the library, by path (absolute, or relative to
 * the library folder). An album or track scan never lists the folder, so it adds nothing; a
 * files scan adds or updates its files and never removes a track.
 */
export const scanScopeSchema = z.discriminatedUnion('kind', [
	z.object({ kind: z.literal('library') }),
	z.object({ kind: z.literal('albums'), ids: scanIds }),
	z.object({ kind: z.literal('tracks'), ids: scanIds }),
	z.object({ kind: z.literal('files'), paths: scanPaths }),
]);

export type ScanScope = z.infer<typeof scanScopeSchema>;

/**
 * The body of a scan request; an empty one scans the whole library. `force` reads the files
 * of the scope again even when their size and modification time are unchanged.
 */
export const scanRequestSchema = z.object({
	scope: scanScopeSchema.default({ kind: 'library' }),
	force: z.boolean().default(false),
});

export type ScanRequest = z.input<typeof scanRequestSchema>;
export type ScanOptions = z.output<typeof scanRequestSchema>;
