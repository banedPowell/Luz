import { describe, expect, it } from 'vite-plus/test';

import { isScanErrorReason } from './scan.ts';

describe('isScanErrorReason', () => {
	it('accepts the known reasons only', () => {
		expect(isScanErrorReason('scan-running')).toBe(true);
		expect(isScanErrorReason('library-path-unset')).toBe(true);
		expect(isScanErrorReason('other')).toBe(false);
		expect(isScanErrorReason(undefined)).toBe(false);
	});
});
