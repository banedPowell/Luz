import { describe, expect, it } from 'vite-plus/test';

import { isScanErrorReason, maxScanIds, scanRequestSchema } from './scan.ts';

describe('isScanErrorReason', () => {
	it('accepts the known reasons only', () => {
		expect(isScanErrorReason('scan-running')).toBe(true);
		expect(isScanErrorReason('library-path-unset')).toBe(true);
		expect(isScanErrorReason('other')).toBe(false);
		expect(isScanErrorReason(undefined)).toBe(false);
	});
});

describe('scanRequestSchema', () => {
	it('scans the whole library without forcing when the body is empty', () => {
		expect(scanRequestSchema.parse({})).toEqual({ scope: { kind: 'library' }, force: false });
	});

	it('accepts a list of albums or tracks, and the force option', () => {
		expect(scanRequestSchema.parse({ scope: { kind: 'albums', ids: [3, 1] } })).toEqual({
			scope: { kind: 'albums', ids: [3, 1] },
			force: false,
		});
		expect(
			scanRequestSchema.parse({ scope: { kind: 'tracks', ids: [7] }, force: true }),
		).toEqual({ scope: { kind: 'tracks', ids: [7] }, force: true });
	});

	it('refuses an empty, invalid or oversized list of ids', () => {
		for (const ids of [
			[],
			[0],
			[1.5],
			['1'],
			Array.from({ length: maxScanIds + 1 }, (_, i) => i + 1),
		]) {
			expect(scanRequestSchema.safeParse({ scope: { kind: 'tracks', ids } }).success).toBe(
				false,
			);
		}
	});

	it('refuses an unknown scope', () => {
		expect(scanRequestSchema.safeParse({ scope: { kind: 'artists', ids: [1] } }).success).toBe(
			false,
		);
		expect(scanRequestSchema.safeParse({ scope: { kind: 'albums' } }).success).toBe(false);
	});
});
