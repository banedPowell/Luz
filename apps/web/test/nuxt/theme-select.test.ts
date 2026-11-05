import { mountSuspended } from '@nuxt/test-utils/runtime';
import { ThemeSelect, UApp } from '#components';
import { describe, expect, it } from 'vitest';
import { defineComponent, h } from 'vue';

// The tooltips need the providers of UApp
function mountThemeSelect(collapsed = false) {
	return mountSuspended(
		defineComponent({ render: () => h(UApp, null, () => h(ThemeSelect, { collapsed })) }),
	);
}

describe('ThemeSelect', () => {
	it('offers light, dark and system, in that order, as named buttons in a group', async () => {
		const wrapper = await mountThemeSelect();

		const group = wrapper.get('[role="group"]');
		const names = group.findAll('button').map((button) => button.attributes('aria-label'));

		expect(group.attributes('aria-label')).toBe('Theme');
		expect(names).toEqual(['Light theme', 'Dark theme', 'System theme']);
	});

	it('marks only the chosen theme as pressed and switches on click', async () => {
		const wrapper = await mountThemeSelect();
		const colorMode = useColorMode();

		await wrapper.get('button[aria-label="Dark theme"]').trigger('click');

		expect(colorMode.preference).toBe('dark');
		const pressed = wrapper
			.findAll('button')
			.filter((button) => button.attributes('aria-pressed') === 'true')
			.map((button) => button.attributes('aria-label'));
		expect(pressed).toEqual(['Dark theme']);

		await wrapper.get('button[aria-label="System theme"]').trigger('click');
		expect(colorMode.preference).toBe('system');
	});

	it('stacks the buttons in the collapsed sidebar', async () => {
		const wrapper = await mountThemeSelect(true);

		expect(wrapper.get('[role="group"]').classes()).toContain('flex-col');
	});
});
