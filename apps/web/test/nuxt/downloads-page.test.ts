import type {
	CreateDownloadRequest,
	DownloadJob,
	DownloadPreview,
	OutputFormat,
	Settings,
	ToolStatus,
} from '@luz/core';
import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime';
import { NuxtPage, UApp } from '#components';
import { createError, readBody } from 'h3';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';

// The page renders toasts, a select popover and a collapsible, which need the providers of UApp
const DownloadsPage = defineComponent({
	render: () => h(UApp, null, () => h(NuxtPage)),
});

let settings: Settings;
let tools: ToolStatus[];
let preview: DownloadPreview;
let analysisFailure: { reason: string; details: string[] } | undefined;
const analyzeRequests: unknown[] = [];
const downloadRequests: CreateDownloadRequest[] = [];

registerEndpoint('/api/settings', { method: 'GET', handler: () => settings });

registerEndpoint('/api/tools', { method: 'GET', handler: () => tools });

registerEndpoint('/api/downloads/analyze', {
	method: 'POST',
	handler: async (event) => {
		analyzeRequests.push(await readBody(event));
		if (analysisFailure) {
			throw createError({ statusCode: 422, message: 'failed', data: analysisFailure });
		}
		return preview;
	},
});

registerEndpoint('/api/downloads', {
	method: 'POST',
	handler: async (event) => {
		const body = await readBody<CreateDownloadRequest>(event);
		downloadRequests.push(body);
		return {
			id: 1,
			url: body.url,
			kind: preview.kind,
			title: preview.title,
			outputFormat: body.outputFormat ?? 'source',
			state: 'queued',
			createdAt: 0,
			itemCount: body.itemIds.length,
			completedCount: 0,
			failedCount: 0,
			items: [],
		} satisfies DownloadJob;
	},
});

const allAvailable: ToolStatus[] = [
	{ tool: 'yt-dlp', command: 'yt-dlp', state: 'available', version: '2025.10.22' },
	{ tool: 'ffmpeg', command: 'ffmpeg', state: 'available', version: '7.1.1' },
	{ tool: 'ffprobe', command: 'ffprobe', state: 'available' },
];

const playlist: DownloadPreview = {
	kind: 'playlist',
	title: 'Discovery',
	items: [
		{
			sourceId: 'a1',
			tags: { title: 'One More Time', artists: ['Daft Punk'], album: 'Discovery' },
			pathWithoutExtension: 'Daft Punk/Discovery/01 One More Time',
			alreadyInLibrary: false,
		},
		{
			sourceId: 'b2',
			tags: { title: 'Aerodynamic', artists: ['Daft Punk'], album: 'Discovery' },
			pathWithoutExtension: 'Daft Punk/Discovery/02 Aerodynamic',
			alreadyInLibrary: true,
		},
		{
			sourceId: 'c3',
			tags: { title: 'Digital Love', artists: ['Daft Punk'], album: 'Discovery' },
			pathWithoutExtension: 'Daft Punk/Discovery/03 Digital Love',
			alreadyInLibrary: false,
		},
	],
};

const url = 'https://www.youtube.com/playlist?list=discovery';

type Wrapper = Awaited<ReturnType<typeof mountPage>>;

// The settings plugin only runs during server rendering, so the tests load them as it would
async function mountPage(outputFormat?: OutputFormat) {
	if (outputFormat) {
		settings = { ...settings, outputFormat };
		await useSettings().load();
	}
	return mountSuspended(DownloadsPage, { route: '/downloads' });
}

function button(wrapper: Wrapper, label: string) {
	const found = wrapper.findAll('button').find((element) => element.text() === label);
	if (!found) {
		throw new Error(`No button "${label}"`);
	}
	return found;
}

function checkbox(wrapper: Wrapper, label: string) {
	return wrapper.find(`[role="checkbox"][aria-label="${label}"]`);
}

function isChecked(wrapper: Wrapper, label: string) {
	return checkbox(wrapper, label).attributes('aria-checked');
}

async function analyse(wrapper: Wrapper, address = url) {
	await wrapper.find('input[name="url"]').setValue(address);
	await wrapper.find('form').trigger('submit');
}

async function analysed(outputFormat?: OutputFormat) {
	const wrapper = await mountPage(outputFormat);
	await analyse(wrapper);
	await vi.waitFor(() => {
		expect(wrapper.find('section[aria-labelledby="preview-title"]').exists()).toBe(true);
	});
	return wrapper;
}

describe('downloads page', () => {
	beforeEach(() => {
		settings = {
			musicLibraryPath: '/music',
			namingTemplate: '{artist}/{title}',
			outputFormat: 'source',
		};
		tools = allAvailable;
		preview = playlist;
		analysisFailure = undefined;
		analyzeRequests.length = 0;
		downloadRequests.length = 0;
		clearNuxtState('settings');
		clearNuxtData();
	});

	it('shows the preview with the final path of each file', async () => {
		const wrapper = await analysed('mp3-320');

		expect(analyzeRequests).toEqual([{ url }]);
		expect(wrapper.find('#preview-title').text()).toBe('Discovery');
		const rows = wrapper.findAll('ul[aria-label="Files to download"] li');
		expect(rows.map((row) => row.text())).toEqual([
			expect.stringContaining('Daft Punk/Discovery/01 One More Time.mp3'),
			expect.stringContaining('Daft Punk/Discovery/02 Aerodynamic.mp3'),
			expect.stringContaining('Daft Punk/Discovery/03 Digital Love.mp3'),
		]);
	});

	it('checks every file except those already in the library, which are flagged', async () => {
		const wrapper = await analysed();

		expect(isChecked(wrapper, 'Select One More Time')).toBe('true');
		expect(isChecked(wrapper, 'Select Aerodynamic')).toBe('false');
		expect(isChecked(wrapper, 'Select Digital Love')).toBe('true');
		const rows = wrapper.findAll('ul[aria-label="Files to download"] li');
		expect(rows[1]?.text()).toContain('Already in library');
		expect(rows[0]?.text()).not.toContain('Already in library');
		expect(wrapper.text()).toContain('2 of 3 selected');
	});

	it('selects and clears every file with the select all box', async () => {
		const wrapper = await analysed();

		expect(isChecked(wrapper, 'Select all files')).toBe('mixed');
		await checkbox(wrapper, 'Select all files').trigger('click');
		expect(wrapper.text()).toContain('3 of 3 selected');
		expect(isChecked(wrapper, 'Select Aerodynamic')).toBe('true');

		await checkbox(wrapper, 'Select all files').trigger('click');
		expect(wrapper.text()).toContain('0 of 3 selected');
		expect(button(wrapper, 'Download').attributes('disabled')).toBeDefined();
	});

	it('shows paths without extension for the source format', async () => {
		const wrapper = await analysed('source');

		const section = wrapper.find('section[aria-labelledby="preview-title"]');
		expect(section.text()).toContain('Daft Punk/Discovery/01 One More Time');
		expect(section.text()).not.toContain('.mp3');
		expect(section.text()).toContain('without their extension');
		expect(section.text()).toContain('Source audio, as is');
	});

	it('defaults the format to the setting', async () => {
		const wrapper = await analysed('mp3-320');

		expect(wrapper.find('section[aria-labelledby="preview-title"]').text()).toContain(
			'MP3, 320 kbit/s',
		);
	});

	it('queues the checked files in order with the chosen format, then clears the preview', async () => {
		const wrapper = await analysed('mp3-320');

		await checkbox(wrapper, 'Select Aerodynamic').trigger('click');
		await checkbox(wrapper, 'Select One More Time').trigger('click');
		await button(wrapper, 'Download').trigger('click');

		await vi.waitFor(() => {
			expect(downloadRequests).toEqual([
				{ url, itemIds: ['b2', 'c3'], outputFormat: 'mp3-320' },
			]);
		});
		await vi.waitFor(() => {
			expect(wrapper.find('section[aria-labelledby="preview-title"]').exists()).toBe(false);
		});
		expect(wrapper.find<HTMLInputElement>('input[name="url"]').element.value).toBe('');
		await vi.waitFor(() => {
			expect(document.body.textContent).toContain('Download queued');
		});
		// In the queue at once, before the stream says so
		expect(wrapper.find('ul[aria-label="Downloads"] li[aria-label="Discovery"]').exists()).toBe(
			true,
		);
	});

	it('sends a format changed before starting', async () => {
		const wrapper = await analysed('mp3-320');

		// The popover of the select does not open in this DOM: the choice goes through its model
		const select = wrapper
			.findAllComponents({ name: 'USelect' })
			.find((component) => component.text().includes('MP3, 320 kbit/s'));
		select?.vm.$emit('update:modelValue', 'mp3-128');
		await vi.waitFor(() => {
			expect(wrapper.find('section[aria-labelledby="preview-title"]').text()).toContain(
				'MP3, 128 kbit/s',
			);
		});

		await button(wrapper, 'Download').trigger('click');
		await vi.waitFor(() => {
			expect(downloadRequests[0]?.outputFormat).toBe('mp3-128');
		});
	});

	it('disables Download while no file is checked', async () => {
		preview = {
			kind: 'track',
			title: 'Aerodynamic',
			items: [playlist.items[1]!],
		};

		const wrapper = await analysed();

		// The bar stays on screen with nothing checked, so Download never has to be found again
		const bar = wrapper.find('section[aria-label="Download"]');
		expect(bar.exists()).toBe(true);
		expect(bar.text()).toContain('0 selected');
		expect(button(wrapper, 'Download').attributes('disabled')).toBeDefined();
	});

	it('explains an invalid address and does not analyse it', async () => {
		const wrapper = await mountPage();

		await analyse(wrapper, 'ftp://example.com/song');

		await vi.waitFor(() => {
			expect(wrapper.text()).toContain(
				'Enter a web address starting with http:// or https://',
			);
		});
		expect(analyzeRequests).toEqual([]);
	});

	it('shows an analysis error in plain language, with the details closed', async () => {
		analysisFailure = {
			reason: 'unavailable',
			details: ['ERROR: [youtube] abc: Private video'],
		};

		const wrapper = await mountPage();
		await analyse(wrapper);

		await vi.waitFor(() => {
			expect(wrapper.text()).toContain('This video or playlist is private, removed');
		});
		expect(wrapper.text()).not.toContain('ERROR: [youtube] abc: Private video');
		expect(wrapper.find('a[href="/settings"]').exists()).toBe(false);

		await button(wrapper, 'Show details').trigger('click');
		await vi.waitFor(() => {
			expect(wrapper.text()).toContain('ERROR: [youtube] abc: Private video');
		});
	});

	it('links to Settings when the library folder is not set', async () => {
		analysisFailure = { reason: 'library-path-unset', details: [] };

		const wrapper = await mountPage();
		await analyse(wrapper);

		await vi.waitFor(() => {
			expect(wrapper.text()).toContain('Choose your music library folder in Settings');
		});
		expect(wrapper.find('a[href="/settings"]').text()).toContain('Open settings');
		expect(wrapper.text()).not.toContain('Show details');
	});

	it('disables Analyse and links to Settings when yt-dlp is missing', async () => {
		tools = [
			{ tool: 'yt-dlp', command: 'yt-dlp', state: 'unavailable', error: 'Not found.' },
			allAvailable[1]!,
			allAvailable[2]!,
		];

		const wrapper = await mountPage();

		expect(button(wrapper, 'Analyse').attributes('disabled')).toBeDefined();
		expect(wrapper.text()).toContain('yt-dlp is not available');
		expect(wrapper.find('a[href="/settings"]').exists()).toBe(true);
	});
});
