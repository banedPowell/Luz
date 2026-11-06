import {
	activeDownloads,
	applyDownloadEvent,
	type DownloadEvent,
	type DownloadJob,
} from '@luz/core';

// One stream for the whole page, however many components follow the queue: the sidebar
// status and the downloads page share it. Only the browser opens it, after mounting.
let source: EventSource | undefined;
let followers = 0;
let reloadQueue: (() => Promise<void>) | undefined;
let applyEvent: ((event: DownloadEvent) => void) | undefined;

const eventTypes = ['job-added', 'job', 'item'] as const satisfies DownloadEvent['type'][];

function open() {
	if (typeof EventSource === 'undefined') {
		return;
	}
	source = new EventSource('/api/downloads/events');
	// Fires on the first connection and on every reconnection: events missed in between
	// are only hints, the list is the truth (ADR 0007)
	source.addEventListener('open', () => void reloadQueue?.());
	for (const type of eventTypes) {
		source.addEventListener(type, (message) => {
			const event = parseEvent(message.data);
			if (event) {
				applyEvent?.(event);
			}
		});
	}
}

function parseEvent(data: unknown): DownloadEvent | undefined {
	if (typeof data !== 'string') {
		return undefined;
	}
	try {
		const parsed: unknown = JSON.parse(data);
		return isDownloadEvent(parsed) ? parsed : undefined;
	} catch {
		return undefined;
	}
}

// Sent by our own server as a DownloadEvent: its type is all there is to check
function isDownloadEvent(value: unknown): value is DownloadEvent {
	if (typeof value !== 'object' || value === null || !('type' in value)) {
		return false;
	}
	return eventTypes.some((type) => type === value.type);
}

/**
 * The download queue, newest job first, kept current by the server-sent events of
 * `GET /api/downloads/events`. Call it from a component: the stream stays open while
 * at least one mounted component follows the queue.
 */
export function useDownloads() {
	const jobs = useState<DownloadJob[]>('download-jobs', () => []);
	const loaded = useState('download-jobs-loaded', () => false);

	async function reload() {
		try {
			jobs.value = await $fetch<DownloadJob[]>('/api/downloads');
			loaded.value = true;
		} catch {
			// The stream reconnects by itself and reloads then
		}
	}

	function apply(event: DownloadEvent) {
		const change = applyDownloadEvent(jobs.value, event);
		if (change === 'reload') {
			void reload();
		} else {
			jobs.value = change;
		}
	}

	/** A job the page just queued, shown before its event arrives. */
	function added(job: DownloadJob) {
		apply({ type: 'job-added', job });
	}

	async function cancel(id: number): Promise<void> {
		await $fetch(`/api/downloads/${id}`, { method: 'DELETE' });
		await reload();
	}

	onMounted(() => {
		reloadQueue = reload;
		applyEvent = apply;
		followers += 1;
		if (followers === 1) {
			open();
		}
	});

	onBeforeUnmount(() => {
		followers -= 1;
		if (followers === 0) {
			source?.close();
			source = undefined;
		}
	});

	return {
		// Computed rather than readonly(): the core helpers take plain jobs, not deep readonly ones
		jobs: computed(() => jobs.value),
		loaded: computed(() => loaded.value),
		active: computed(() => activeDownloads(jobs.value)),
		added,
		cancel,
	};
}
