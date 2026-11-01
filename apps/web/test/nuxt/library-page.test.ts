import type { ScanSummary, Settings } from '@luz/core';
import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime';
import { NuxtPage, UApp } from '#components';
import { createError } from 'h3';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';

const LibraryPage = defineComponent({
	render: () => h(UApp, null, () => h(NuxtPage)),
});

let stored: Settings;
let scanResult: ScanSummary | { reason: string };
let release: () => void;
let gate: Promise<void> | undefined;

registerEndpoint('/api/settings', { method: 'GET', handler: () => stored });

registerEndpoint('/api/library/scan', {
	method: 'POST',
	handler: async () => {
		await gate;
		if ('reason' in scanResult) {
			throw createError({ statusCode: 409, data: { reason: scanResult.reason } });
		}
		return scanResult;
	},
});

async function mountPage() {
	await useSettings().load();
	return mountSuspended(LibraryPage, { route: '/library' });
}

function scanButton(wrapper: Awaited<ReturnType<typeof mountPage>>) {
	const button = wrapper.findAll('button').find((item) => item.text() === 'Scan library');
	if (!button) {
		throw new Error('No scan button');
	}
	return button;
}

describe('library page', () => {
	beforeEach(() => {
		stored = { theme: 'system', musicLibraryPath: '/music' };
		scanResult = { filesFound: 3, tracksIndexed: 2, filesSkipped: 1 };
		gate = undefined;
		clearNuxtState('settings');
	});

	it('links to the settings when no folder is set', async () => {
		stored = { theme: 'system' };

		const wrapper = await mountPage();

		expect(wrapper.text()).toContain('No music folder yet');
		expect(wrapper.find('a[href="/settings"]').text()).toContain('Open settings');
		expect(wrapper.text()).not.toContain('Scan library');
	});

	it('shows the scan running, then its summary', async () => {
		gate = new Promise((resolve) => {
			release = resolve;
		});
		const wrapper = await mountPage();

		expect(wrapper.text()).toContain('/music');
		await scanButton(wrapper).trigger('click');

		await vi.waitFor(() => {
			expect(wrapper.text()).toContain('Scanning your music folder');
		});
		release();
		await vi.waitFor(() => {
			expect(wrapper.text()).toContain(
				'3 audio files found, 2 tracks indexed, 1 file skipped.',
			);
		});
	});

	it('explains a refused scan', async () => {
		scanResult = { reason: 'scan-running' };
		const wrapper = await mountPage();

		await scanButton(wrapper).trigger('click');

		await vi.waitFor(() => {
			expect(wrapper.text()).toContain('A scan is already running');
		});
	});

	it('links to the settings when the folder is missing', async () => {
		scanResult = { reason: 'library-path-missing' };
		const wrapper = await mountPage();

		await scanButton(wrapper).trigger('click');

		await vi.waitFor(() => {
			expect(wrapper.text()).toContain('does not exist');
		});
		expect(wrapper.find('a[href="/settings"]').exists()).toBe(true);
	});
});
