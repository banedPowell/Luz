import type { Settings } from '@luz/core';
import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime';
import { NuxtLayout, UApp } from '#components';
import { describe, expect, it } from 'vitest';
import { defineComponent, h } from 'vue';

// The sidebar has tooltips and a theme menu, which need the providers of UApp
const DefaultLayout = defineComponent({
	render: () => h(UApp, null, () => h(NuxtLayout, null, () => h('p', 'Page content'))),
});

// The theme menu in the sidebar footer reads the saved settings
registerEndpoint('/api/settings', {
	method: 'GET',
	handler: (): Settings => ({ theme: 'system' }),
});

const focusable =
	'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])';

describe('default layout', () => {
	it('starts with a link that skips to the main content', async () => {
		const wrapper = await mountSuspended(DefaultLayout);

		const first = wrapper.find(focusable);

		expect(first.element.tagName).toBe('A');
		expect(first.text()).toBe('Skip to content');
		expect(first.attributes('href')).toBe('#main');
	});

	it('hides the skip link until it receives focus', async () => {
		const wrapper = await mountSuspended(DefaultLayout);

		const classes = wrapper.find('a[href="#main"]').classes();

		expect(classes).toContain('sr-only');
		expect(classes).toContain('focus:not-sr-only');
	});

	it('targets the main element, which can receive focus', async () => {
		const wrapper = await mountSuspended(DefaultLayout);

		const main = wrapper.find('main#main');

		expect(main.exists()).toBe(true);
		expect(main.attributes('tabindex')).toBe('-1');
		expect(main.text()).toContain('Page content');
	});
});
