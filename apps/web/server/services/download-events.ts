import type { DownloadEvent } from '@luz/core';

export type DownloadEventListener = (event: DownloadEvent) => void;

export interface DownloadEvents {
	emit: (event: DownloadEvent) => void;
	/** Returns the function that stops listening. */
	subscribe: (listener: DownloadEventListener) => () => void;
}

/** Fans the queue's events out to the open streams, in this process only (ADR 0007). */
export function createDownloadEvents(): DownloadEvents {
	const listeners = new Set<DownloadEventListener>();
	return {
		emit(event) {
			for (const listener of listeners) {
				// A broken stream must not stop the queue, nor the other streams
				try {
					listener(event);
				} catch {
					listeners.delete(listener);
				}
			}
		},
		subscribe(listener) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
	};
}
