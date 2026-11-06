import type { DownloadEvent, DownloadItem, DownloadJob } from '@luz/core';
import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime';
import { DownloadQueue, DownloadStatus, UApp } from '#components';
import { flushPromises } from '@vue/test-utils';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';

// The stream of the server, driven by the tests: open, then events, as the browser would
class FakeEventSource {
	static instances: FakeEventSource[] = [];
	readonly listeners = new Map<string, ((message: MessageEvent) => void)[]>();
	closed = false;

	constructor(readonly url: string) {
		FakeEventSource.instances.push(this);
	}

	addEventListener(type: string, listener: (message: MessageEvent) => void) {
		this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
	}

	close() {
		this.closed = true;
	}

	emit(type: string, data?: DownloadEvent) {
		const message = new MessageEvent(type, data ? { data: JSON.stringify(data) } : {});
		for (const listener of this.listeners.get(type) ?? []) {
			listener(message);
		}
	}
}

vi.stubGlobal('EventSource', FakeEventSource);
afterAll(() => vi.unstubAllGlobals());

function stream(): FakeEventSource {
	const open = FakeEventSource.instances.filter((source) => !source.closed);
	expect(open).toHaveLength(1);
	const [source] = open;
	if (!source) {
		throw new Error('No stream open');
	}
	return source;
}

let jobs: DownloadJob[];
const cancelled: number[] = [];

let listed = 0;

registerEndpoint('/api/downloads', {
	method: 'GET',
	handler: () => {
		listed += 1;
		return jobs;
	},
});

// The list goes through a real request: wait until it is served, then rendered
async function reconnect() {
	const before = listed;
	stream().emit('open');
	await vi.waitFor(() => expect(listed).toBeGreaterThan(before));
	await new Promise((resolve) => setTimeout(resolve, 0));
	await flushPromises();
}

registerEndpoint('/api/downloads/1', {
	method: 'DELETE',
	handler: () => {
		cancelled.push(1);
		jobs = jobs.map((entry) => (entry.id === 1 ? { ...entry, state: 'cancelled' } : entry));
		return jobs.find((entry) => entry.id === 1);
	},
});

function item(id: number, overrides: Partial<DownloadItem> = {}): DownloadItem {
	return {
		id,
		position: id,
		sourceId: `s${id}`,
		title: `Track ${id}`,
		tags: { artists: ['Daft Punk'] },
		pathWithoutExtension: `Daft Punk/Discovery/0${id} Track ${id}`,
		state: 'queued',
		log: [],
		...overrides,
	};
}

function job(id: number, overrides: Partial<DownloadJob> = {}): DownloadJob {
	const items = overrides.items ?? [item(id * 10)];
	return {
		id,
		url: 'https://example.com/list',
		kind: 'playlist',
		title: `Job ${id}`,
		outputFormat: 'mp3-320',
		state: 'queued',
		createdAt: id,
		itemCount: items.length,
		completedCount: 0,
		failedCount: 0,
		...overrides,
		items,
	};
}

const runningJob = (): DownloadJob =>
	job(1, {
		title: 'Discovery',
		state: 'running',
		completedCount: 1,
		failedCount: 1,
		items: [
			item(1, { state: 'completed', step: 'added' }),
			item(2, {
				state: 'failed',
				error: { reason: 'unavailable', message: 'This video is private.' },
				log: ['ERROR: [youtube] b2: Private video'],
			}),
			item(3, { state: 'running', step: 'downloading', progressPercent: 40 }),
			item(4),
		],
	});

async function mountQueue() {
	const wrapper = await mountSuspended(
		defineComponent({ render: () => h(UApp, null, () => h(DownloadQueue)) }),
	);
	await reconnect();
	return wrapper;
}

describe('download queue', () => {
	beforeEach(() => {
		jobs = [runningJob(), job(2, { title: 'Homework', state: 'completed', completedCount: 1 })];
		cancelled.length = 0;
	});

	it('lists the jobs with their counts, and Cancel only while they run or wait', async () => {
		const wrapper = await mountQueue();
		const [discovery, homework] = wrapper.findAll('[aria-label="Downloads"] > li');
		expect(discovery?.text()).toContain('Discovery');
		expect(discovery?.text()).toContain('1 done · 1 failed · 2 remaining');
		expect(discovery?.find('[aria-label="Cancel Discovery"]').exists()).toBe(true);
		expect(homework?.text()).toContain('Completed');
		expect(homework?.find('button[aria-label^="Cancel"]').exists()).toBe(false);
	});

	it('shows the step of a running file and why a failed one failed, details closed', async () => {
		const wrapper = await mountQueue();
		const text = wrapper.text();
		expect(text).toContain('Downloading, 40%');
		expect(text).toContain('This video is private.');
		// Completed and queued files are in the counts only
		expect(text).not.toContain('Track 1');
		expect(text).not.toContain('Private video');

		const details = wrapper
			.findAll('button')
			.find((button) => button.text() === 'Show details');
		await details?.trigger('click');
		expect(wrapper.text()).toContain('ERROR: [youtube] b2: Private video');
	});

	it('follows the events of the stream', async () => {
		const wrapper = await mountQueue();
		stream().emit('item', {
			type: 'item',
			jobId: 1,
			item: { id: 3, state: 'running', step: 'converting' },
		});
		await flushPromises();
		expect(wrapper.text()).toContain('Converting to MP3');

		stream().emit('job-added', { type: 'job-added', job: job(3, { title: 'Random Access' }) });
		await flushPromises();
		const titles = wrapper
			.findAll('[aria-label="Downloads"] > li')
			.map((li) => li.attributes('aria-label'));
		expect(titles).toEqual(['Random Access', 'Discovery', 'Homework']);
	});

	it('reloads the list when the stream reconnects', async () => {
		const wrapper = await mountQueue();
		jobs = [
			job(1, {
				title: 'Discovery',
				state: 'failed',
				error: { reason: 'interrupted', message: 'Luz stopped.' },
			}),
		];
		await reconnect();
		expect(wrapper.text()).toContain('Luz stopped.');
		expect(wrapper.text()).not.toContain('Homework');
	});

	it('cancels a job only once the modal confirms it', async () => {
		const wrapper = await mountQueue();
		await wrapper.find('[aria-label="Cancel Discovery"]').trigger('click');
		await flushPromises();
		const confirm = [...document.body.querySelectorAll('button')].find(
			(button) => button.textContent?.trim() === 'Cancel download',
		);
		expect(document.body.textContent).toContain('Tracks already in your library stay there.');
		expect(cancelled).toEqual([]);

		confirm?.click();
		await vi.waitFor(() => expect(cancelled).toEqual([1]));
		// The queue reloads once the server has cancelled it
		await vi.waitFor(() =>
			expect(wrapper.find('[aria-label="Cancel Discovery"]').exists()).toBe(false),
		);
		expect(wrapper.text()).toContain('Cancelled');
	});

	it('says so when there is no download yet', async () => {
		jobs = [];
		const wrapper = await mountQueue();
		expect(wrapper.text()).toContain('No downloads yet.');
	});
});

async function mountStatus(props: Record<string, unknown> = {}) {
	const wrapper = await mountSuspended(
		defineComponent({ render: () => h(UApp, null, () => h(DownloadStatus, props)) }),
	);
	await reconnect();
	return wrapper;
}

describe('download status', () => {
	beforeEach(() => {
		jobs = [runningJob()];
	});

	it('sums up the running downloads and links to them', async () => {
		const wrapper = await mountStatus();
		const link = wrapper.find('a[href="/downloads"]');
		// 1 done, 1 failed and 40% of a third out of 4
		expect(link.attributes('aria-label')).toBe('1 download, 60%');
		expect(link.text()).toContain('1 download');
	});

	it('keeps a compact form for the top bar of narrow screens', async () => {
		const wrapper = await mountStatus({ variant: 'bar' });
		const link = wrapper.find('a[href="/downloads"]');
		expect(link.attributes('aria-label')).toBe('1 download, 60%');
		expect(link.text()).toBe('60%');
	});

	it('draws nothing while nothing is queued or running', async () => {
		jobs = [job(2, { state: 'completed', completedCount: 1 })];
		const wrapper = await mountStatus();
		expect(wrapper.find('a[href="/downloads"]').exists()).toBe(false);
	});

	it('shares one stream between everything that follows the queue', async () => {
		await mountSuspended(
			defineComponent({
				render: () =>
					h(UApp, null, () => [h(DownloadStatus), h(DownloadStatus, { variant: 'bar' })]),
			}),
		);
		expect(FakeEventSource.instances.filter((source) => !source.closed)).toHaveLength(1);
	});
});
