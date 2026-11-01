import { isScanErrorReason, type ScanErrorReason, type ScanSummary } from '@luz/core';

export type ScanFailure = ScanErrorReason | 'unknown';

function field(value: unknown, key: string): unknown {
	return typeof value === 'object' && value !== null ? Reflect.get(value, key) : undefined;
}

// The API sends the reason in the error data; never show the server's own message
function reasonOf(error: unknown): ScanFailure {
	const reason = field(field(field(error, 'data'), 'data'), 'reason');
	return isScanErrorReason(reason) ? reason : 'unknown';
}

/**
 * The library scan, shared by the scan bar and the empty library views, so either can
 * start it. A finished scan refreshes the lists on screen.
 */
export function useLibraryScan() {
	const scanning = useState('library-scanning', () => false);
	const summary = useState<ScanSummary | undefined>('library-scan-summary', () => undefined);
	const failure = useState<ScanFailure | undefined>('library-scan-failure', () => undefined);

	async function scan() {
		scanning.value = true;
		failure.value = undefined;
		try {
			summary.value = await $fetch<ScanSummary>('/api/library/scan', { method: 'POST' });
		} catch (error) {
			failure.value = reasonOf(error);
			return;
		} finally {
			scanning.value = false;
		}
		await refreshNuxtData();
	}

	return {
		scanning: readonly(scanning),
		summary: readonly(summary),
		failure: readonly(failure),
		scan,
	};
}
