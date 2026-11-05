import type { DownloadEvent } from '@luz/core';
import { describe, expect, it } from 'vitest';

import { createDownloadEvents } from '../../server/services/download-events';

const event: DownloadEvent = {
	type: 'item',
	jobId: 1,
	item: { id: 2, state: 'running', step: 'downloading', progressPercent: 10 },
};

describe('download events', () => {
	it('gives every listener each event, until it stops listening', () => {
		const events = createDownloadEvents();
		const first: DownloadEvent[] = [];
		const second: DownloadEvent[] = [];
		const stopFirst = events.subscribe((received) => first.push(received));
		events.subscribe((received) => second.push(received));

		events.emit(event);
		stopFirst();
		events.emit(event);

		expect(first).toEqual([event]);
		expect(second).toEqual([event, event]);
	});

	it('drops a listener that throws, and keeps the others', () => {
		const events = createDownloadEvents();
		const received: DownloadEvent[] = [];
		events.subscribe(() => {
			throw new Error('stream closed');
		});
		events.subscribe((next) => received.push(next));

		expect(() => events.emit(event)).not.toThrow();
		events.emit(event);

		expect(received).toHaveLength(2);
	});
});
