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

function describe(summary: ScanSummary): string {
	return `${plural(summary.added, 'track')} added, ${summary.updated} updated, ${summary.removed} removed, ${summary.unchanged} unchanged, ${plural(summary.skipped, 'file')} skipped.`;
}

/**
 * The library scan, shared by the scan bar and the empty library views, so either can
 * start it. A finished scan refreshes the lists on screen and sums itself up in a toast,
 * which leaves the page as it was; a refused one stays on the page, where it can link to
 * the settings.
 */
export function useLibraryScan() {
	const toast = useToast();
	const appConfig = useAppConfig();
	const scanning = useState('library-scanning', () => false);
	const failure = useState<ScanFailure | undefined>('library-scan-failure', () => undefined);

	async function scan() {
		scanning.value = true;
		failure.value = undefined;
		let summary: ScanSummary;
		try {
			summary = await $fetch<ScanSummary>('/api/library/scan', { method: 'POST' });
		} catch (error) {
			failure.value = reasonOf(error);
			return;
		} finally {
			scanning.value = false;
		}
		toast.add({
			title: 'Scan complete',
			description: describe(summary),
			color: 'success',
			icon: appConfig.ui.icons.success,
		});
		await refreshNuxtData();
	}

	return {
		scanning: readonly(scanning),
		failure: readonly(failure),
		scan,
	};
}
