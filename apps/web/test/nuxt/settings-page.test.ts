import type { Settings, SettingsPatch } from '@luz/core';
import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime';
import { NuxtPage, UApp } from '#components';
import { readBody } from 'h3';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';

// The page renders toasts and a select popover, which need the providers of UApp
const SettingsPage = defineComponent({
	render: () => h(UApp, null, () => h(NuxtPage)),
});

let stored: Settings;
let getFails: boolean;
const patches: SettingsPatch[] = [];

registerEndpoint('/api/settings', {
	method: 'GET',
	handler: () => {
		if (getFails) {
			throw new Error('database unavailable');
		}
		return stored;
	},
});

registerEndpoint('/api/settings', {
	method: 'PATCH',
	handler: async (event) => {
		const patch = await readBody<SettingsPatch>(event);
		patches.push(patch);
		const { musicLibraryPath, ...rest } = { ...stored, ...patch };
		stored = musicLibraryPath ? { ...rest, musicLibraryPath } : rest;
		return stored;
	},
});

async function mountPage() {
	return mountSuspended(SettingsPage, { route: '/settings' });
}

describe('settings page', () => {
	beforeEach(() => {
		stored = { theme: 'dark', musicLibraryPath: '/music' };
		getFails = false;
		patches.length = 0;
		clearNuxtState('settings');
	});

	it('shows the saved settings', async () => {
		const wrapper = await mountPage();

		expect(wrapper.find('input').element.value).toBe('/music');
		expect(wrapper.text()).toContain('Dark');
	});

	it('labels both fields', async () => {
		const wrapper = await mountPage();

		const labels = wrapper.findAll('label').map((label) => label.text());
		expect(labels).toEqual(expect.arrayContaining(['Theme', 'Music library']));
		const input = wrapper.find('input');
		expect(wrapper.find(`label[for="${input.attributes('id')}"]`).exists()).toBe(true);
	});

	it('shows a validation error for a relative path and does not save', async () => {
		const wrapper = await mountPage();

		await wrapper.find('input').setValue('Music');
		await wrapper.find('form').trigger('submit');

		await vi.waitFor(() => {
			expect(wrapper.text()).toContain('Use an absolute path');
		});
		expect(patches).toEqual([]);
	});

	it('saves the form and clears an emptied path with null', async () => {
		const wrapper = await mountPage();

		await wrapper.find('input').setValue('   ');
		await wrapper.find('form').trigger('submit');

		await vi.waitFor(() => {
			expect(patches).toEqual([{ theme: 'dark', musicLibraryPath: null }]);
		});
		await vi.waitFor(() => {
			expect(document.body.textContent).toContain('Settings saved');
		});
		expect(wrapper.find('input').element.value).toBe('');
	});

	it('warns when the settings cannot be loaded', async () => {
		getFails = true;

		const wrapper = await mountPage();

		expect(wrapper.text()).toContain('Could not load the settings');
		expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeDefined();
	});
});
