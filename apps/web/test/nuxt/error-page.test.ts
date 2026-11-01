import type { Settings } from '@luz/core';
import { createError } from '#app';
import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime';
import { ErrorPage } from '#components';
import { describe, expect, it, vi } from 'vitest';

// The sidebar's theme menu reads the saved settings
registerEndpoint('/api/settings', {
	method: 'GET',
	handler: (): Settings => ({ theme: 'system' }),
});

function mountError(status: number, details: { statusText?: string; message?: string } = {}) {
	const error = createError({ status, ...details });
	error.stack = 'Error: secret\n    at internalFunction (server/secret.ts:1:1)';
	return mountSuspended(ErrorPage, { props: { error } });
}

describe('error page', () => {
	it('shows a not found message inside the app shell', async () => {
		const wrapper = await mountError(404, { statusText: 'Page not found: /nowhere' });

		expect(wrapper.find('nav').exists()).toBe(true);
		expect(wrapper.find('main#main').exists()).toBe(true);
		expect(wrapper.find('header h1').text()).toBe('Page not found');
		expect(wrapper.find('main h2').text()).toBe('Page not found');
		expect(wrapper.find('main').text()).toContain('404');
		expect(wrapper.find('main').text()).not.toContain('/nowhere');
	});

	it('names the error in the document title', async () => {
		document.title = '';
		await mountError(404);

		await vi.waitFor(() => expect(document.title).toBe('Page not found · Luz'));
	});

	it('offers a way back to Home', async () => {
		const wrapper = await mountError(404);

		const button = wrapper.find('main button');

		expect(button.text()).toBe('Back to Home');
	});

	it('shows a generic message with the status code for other errors', async () => {
		const wrapper = await mountError(500, {
			statusText: 'Internal Server Error',
			message: 'connection to luz.db refused',
		});

		const main = wrapper.find('main').text();

		expect(wrapper.find('header h1').text()).toBe('Something went wrong');
		expect(main).toContain('500');
		expect(main).toContain('Something went wrong');
		expect(main).not.toContain('luz.db');
		expect(main).not.toContain('internalFunction');
	});

	it('keeps a single main landmark and a single page heading', async () => {
		const wrapper = await mountError(500);

		expect(wrapper.findAll('main')).toHaveLength(1);
		expect(wrapper.findAll('h1')).toHaveLength(1);
	});
});
