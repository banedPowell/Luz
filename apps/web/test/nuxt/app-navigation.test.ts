import { mountSuspended } from '@nuxt/test-utils/runtime';
import { AppNavigation, UApp } from '#components';
import { describe, expect, it } from 'vitest';
import { defineComponent, h } from 'vue';

describe('AppNavigation', () => {
	it('links to every section of the app', async () => {
		const wrapper = await mountSuspended(AppNavigation);

		const links = wrapper.findAll('a').map((link) => ({
			label: link.text(),
			href: link.attributes('href'),
		}));

		expect(links).toEqual([
			{ label: 'Home', href: '/' },
			{ label: 'Library', href: '/library' },
			{ label: 'Downloads', href: '/downloads' },
			{ label: 'Settings', href: '/settings' },
		]);
	});

	it('marks only the current section with aria-current', async () => {
		const wrapper = await mountSuspended(AppNavigation, { route: '/downloads' });

		const current = wrapper.findAll('a[aria-current="page"]');

		expect(current).toHaveLength(1);
		expect(current[0]?.text()).toBe('Downloads');
	});

	it('exposes the navigation landmark with a label', async () => {
		const wrapper = await mountSuspended(AppNavigation);

		expect(wrapper.find('nav[aria-label="Main"]').exists()).toBe(true);
	});

	it('keeps accessible names when collapsed to icons', async () => {
		// Collapsed links get tooltips, which need the provider that UApp sets up
		const CollapsedInApp = defineComponent({
			render: () => h(UApp, null, () => h(AppNavigation, { collapsed: true })),
		});
		const wrapper = await mountSuspended(CollapsedInApp);

		// happy-dom ignores CSS, so the hidden label would still give text():
		// collapsed, the name must come from aria-label
		const names = wrapper.findAll('a').map((link) => link.attributes('aria-label'));

		expect(names).toEqual(['Home', 'Library', 'Downloads', 'Settings']);
	});

	it('names expanded links by their visible label only', async () => {
		const wrapper = await mountSuspended(AppNavigation);

		for (const link of wrapper.findAll('a')) {
			expect(link.attributes('aria-label')).toBeUndefined();
		}
	});
});
