import {
	isScanErrorReason,
	type ScanErrorReason,
	type ScanRequest,
	type ScanScope,
	type ScanSummary,
} from '@luz/core';

export type ScanFailure = ScanErrorReason | 'unknown';

/** Why a scan could not run, in words, for the scan bar and the rescan toast. */
export const scanFailureMessages: Record<ScanFailure, string> = {
	'library-path-unset': 'No music library folder is set.',
	'library-path-missing':
		'The music library folder does not exist. Check the path in the settings.',
	'scan-running': 'A scan is already running. Try again once it is done.',
	unknown: 'The scan failed. Try again later.',
};

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

function requestScan(body?: ScanRequest) {
	return $fetch<ScanSummary>('/api/library/scan', { method: 'POST', body });
}

/**
 * The library scan, shared by the scan bar and the empty library views, so either can
 * start it. A finished scan refreshes the lists on screen and sums itself up in a toast,
 * which leaves the page as it was; a refused one stays on the page, where it can link to
 * the settings.
 *
 * `rescan` scans the albums or tracks of a row menu only. It always reads their files
 * again: the user asked for it, and a scope holds few files. Its outcome, refusal
 * included, is a toast, since the row it came from has no room to explain.
 */
export function useLibraryScan() {
	const toast = useToast();
	const appConfig = useAppConfig();
	const scanning = useState('library-scanning', () => false);
	const failure = useState<ScanFailure | undefined>('library-scan-failure', () => undefined);

	async function finished(title: string, summary: ScanSummary) {
		toast.add({
			title,
			description: describe(summary),
			color: 'success',
			icon: appConfig.ui.icons.success,
		});
		await refreshNuxtData();
	}

	async function scan() {
		scanning.value = true;
		failure.value = undefined;
		let summary: ScanSummary;
		try {
			summary = await requestScan();
		} catch (error) {
			failure.value = reasonOf(error);
			return;
		} finally {
			scanning.value = false;
		}
		await finished('Scan complete', summary);
	}

	async function rescan(scope: ScanScope) {
		let summary: ScanSummary;
		try {
			summary = await requestScan({ scope, force: true });
		} catch (error) {
			toast.add({
				title: 'Could not rescan',
				description: scanFailureMessages[reasonOf(error)],
				color: 'error',
				icon: appConfig.ui.icons.error,
			});
			return;
		}
		await finished('Rescan complete', summary);
	}

	return {
		scanning: readonly(scanning),
		failure: readonly(failure),
		scan,
		rescan,
	};
}
