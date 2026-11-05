import {
	defaultNamingTemplate,
	settingsPatchSchema,
	type Settings,
	type SettingsPatch,
	type ToolStatus,
} from '@luz/core';
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
		const body = await readBody<SettingsPatch>(event);
		patches.push(body);
		// Parsed like the API does, so the page gets the trimmed values back
		const patch = settingsPatchSchema.parse(body);
		const namingTemplate = patch.namingTemplate ?? stored.namingTemplate;
		const musicLibraryPath =
			patch.musicLibraryPath === undefined ? stored.musicLibraryPath : patch.musicLibraryPath;
		stored = musicLibraryPath ? { musicLibraryPath, namingTemplate } : { namingTemplate };
		return stored;
	},
});

let tools: ToolStatus[];
let toolRequests: number;

registerEndpoint('/api/tools', {
	method: 'GET',
	handler: () => {
		toolRequests += 1;
		return tools;
	},
});

const allAvailable: ToolStatus[] = [
	{ tool: 'yt-dlp', command: 'yt-dlp', state: 'available', version: '2025.10.22' },
	{ tool: 'ffmpeg', command: 'ffmpeg', state: 'available', version: '7.1.1' },
	{ tool: 'ffprobe', command: 'ffprobe', state: 'available' },
];

function namingInput(wrapper: Awaited<ReturnType<typeof mountPage>>) {
	return wrapper.find<HTMLInputElement>('input[name="namingTemplate"]');
}

async function mountPage() {
	return mountSuspended(SettingsPage, { route: '/settings' });
}

describe('settings page', () => {
	beforeEach(() => {
		stored = { musicLibraryPath: '/music', namingTemplate: '{artist}/{title}' };
		useColorMode().preference = 'dark';
		getFails = false;
		patches.length = 0;
		tools = allAvailable;
		toolRequests = 0;
		clearNuxtState('settings');
		clearNuxtData();
	});

	it('shows the saved settings and the theme of this browser', async () => {
		const wrapper = await mountPage();

		expect(wrapper.find('input').element.value).toBe('/music');
		expect(wrapper.text()).toContain('Dark');
	});

	// A browser preference, kept in the color-mode cookie (ADR 0006)
	it('keeps the theme out of the saved form', async () => {
		const wrapper = await mountPage();

		expect(wrapper.find('form').text()).not.toContain('Theme');
		await wrapper.find('form').trigger('submit');

		await vi.waitFor(() => {
			expect(patches).toEqual([
				{ musicLibraryPath: '/music', namingTemplate: '{artist}/{title}' },
			]);
		});
	});

	it('labels both fields', async () => {
		const wrapper = await mountPage();

		const labels = wrapper.findAll('label').map((label) => label.text());
		expect(labels).toEqual(expect.arrayContaining(['Theme', 'Music library', 'File names']));
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
			expect(patches).toEqual([
				{ musicLibraryPath: null, namingTemplate: '{artist}/{title}' },
			]);
		});
		await vi.waitFor(() => {
			expect(document.body.textContent).toContain('Settings saved');
		});
		expect(wrapper.find('input').element.value).toBe('');
	});

	it('shows the saved file name template with an example', async () => {
		const wrapper = await mountPage();

		expect(namingInput(wrapper).element.value).toBe('{artist}/{title}');
		expect(wrapper.text()).toContain('Example: Daft Punk/Digital Love.flac');
	});

	it('updates the example as the template is typed', async () => {
		const wrapper = await mountPage();

		await namingInput(wrapper).setValue(defaultNamingTemplate);

		expect(wrapper.text()).toContain('Example: Daft Punk/Discovery/1-03 Digital Love.flac');
	});

	it('shows the template error under the field instead of the example, and does not save', async () => {
		const wrapper = await mountPage();

		await namingInput(wrapper).setValue('{genre}/{title}');
		await wrapper.find('form').trigger('submit');

		await vi.waitFor(() => {
			expect(wrapper.text()).toContain('Unknown placeholder {genre}');
		});
		expect(wrapper.text()).not.toContain('Example:');
		expect(patches).toEqual([]);
	});

	it('saves a new file name template', async () => {
		const wrapper = await mountPage();

		await namingInput(wrapper).setValue(' {album}/{track:02} {title} ');
		await wrapper.find('form').trigger('submit');

		await vi.waitFor(() => {
			expect(patches).toEqual([
				{ musicLibraryPath: '/music', namingTemplate: ' {album}/{track:02} {title} ' },
			]);
		});
		await vi.waitFor(() => {
			expect(namingInput(wrapper).element.value).toBe('{album}/{track:02} {title}');
		});
	});

	it('warns when the settings cannot be loaded', async () => {
		getFails = true;

		const wrapper = await mountPage();

		expect(wrapper.text()).toContain('Could not load the settings');
		expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeDefined();
	});

	it('shows each tool with its version and its command', async () => {
		const wrapper = await mountPage();

		const items = wrapper.findAll('section[aria-labelledby="tools-title"] li');
		expect(items.map((item) => item.text())).toEqual([
			expect.stringMatching(/yt-dlp.*Available.*Version 2025\.10\.22.*yt-dlp/),
			expect.stringMatching(/FFmpeg.*Available.*Version 7\.1\.1.*ffmpeg/),
			expect.stringMatching(/ffprobe.*Available.*ffprobe/),
		]);
	});

	it('explains why a tool is unavailable', async () => {
		tools = [
			allAvailable[0]!,
			{
				tool: 'ffmpeg',
				command: String.raw`C:\Tools\ffmpeg.exe`,
				state: 'unavailable',
				error: 'Not found. Install it, or set NUXT_FFMPEG_PATH to its full path.',
			},
			allAvailable[2]!,
		];

		const wrapper = await mountPage();

		const ffmpeg = wrapper.findAll('section[aria-labelledby="tools-title"] li')[1];
		expect(ffmpeg?.text()).toContain('Unavailable');
		expect(ffmpeg?.text()).toContain('set NUXT_FFMPEG_PATH');
		expect(ffmpeg?.text()).toContain(String.raw`C:\Tools\ffmpeg.exe`);
	});

	it('checks again while the startup check is pending', async () => {
		tools = allAvailable.map(({ tool, command }) => ({ tool, command, state: 'pending' }));

		const wrapper = await mountPage();
		expect(wrapper.text()).toContain('Checking');

		tools = allAvailable;
		await vi.waitFor(
			() => {
				expect(wrapper.text()).not.toContain('Checking');
			},
			{ timeout: 3000 },
		);
		expect(wrapper.text()).toContain('Version 2025.10.22');
		const requests = toolRequests;
		await new Promise((resolve) => setTimeout(resolve, 1200));
		expect(toolRequests).toBe(requests);
	});
});
