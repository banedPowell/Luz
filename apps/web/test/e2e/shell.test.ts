import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createPage, setup } from '@nuxt/test-utils/e2e';
import { afterAll, describe, expect, it } from 'vitest';
import { sharedBuild } from './build';

// The theme switch saves through the API: keep its database away from the user's
const dataDir = mkdtempSync(path.join(tmpdir(), 'luz-e2e-'));

afterAll(() => {
	rmSync(dataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});

const links = ['Home', 'Library', 'Downloads', 'Settings'];

describe('app shell in a browser', async () => {
	await setup({
		...sharedBuild,
		env: { NUXT_DATA_DIR: dataDir },
		browser: true,
	});

	it('collapses and expands the sidebar, keeping an accessible name on every link', async () => {
		const page = await createPage('/');
		const navigation = page.getByRole('navigation', { name: 'Main' });

		await page.getByRole('button', { name: 'Close sidebar' }).click();
		const toggle = page.getByRole('button', { name: 'Open sidebar' });
		expect(await toggle.getAttribute('aria-expanded')).toBe('false');

		for (const name of links) {
			const link = navigation.getByRole('link', { name, exact: true });
			await link.waitFor();
			// Collapsed, the link shows its icon only: its name must come from elsewhere
			expect(await link.innerText()).toBe('');
		}

		await toggle.click();
		expect(
			await page.getByRole('button', { name: 'Close sidebar' }).getAttribute('aria-expanded'),
		).toBe('true');
		for (const name of links) {
			const link = navigation.getByRole('link', { name, exact: true });
			expect((await link.innerText()).trim()).toBe(name);
		}

		await page.close();
	});

	it('opens the menu on a narrow screen, follows a link and closes the menu', async () => {
		const page = await createPage('/', { viewport: { width: 375, height: 812 } });

		await page.getByRole('button', { name: 'Open sidebar' }).click();
		const menu = page.getByRole('dialog');
		await menu.waitFor();

		await menu.getByRole('link', { name: 'Library', exact: true }).click();
		await page.waitForURL('**/library');
		await menu.waitFor({ state: 'hidden' });
		expect(await page.getByRole('heading', { level: 1 }).innerText()).toBe('Library');

		await page.close();
	});

	it('switches between light and dark and the dark class on <html> follows', async () => {
		const page = await createPage('/');
		// Selectors rather than page.evaluate: this test is type checked without the DOM library
		await page.getByRole('button', { name: /^Theme: / }).click();
		await page.getByRole('menuitemcheckbox', { name: 'Dark' }).click();
		await page.waitForSelector('html.dark', { state: 'attached' });

		await page.getByRole('button', { name: 'Theme: Dark' }).click();
		await page.getByRole('menuitemcheckbox', { name: 'Light' }).click();
		await page.waitForSelector('html:not(.dark)', { state: 'attached' });
		expect(await page.locator('html').getAttribute('class')).not.toMatch(/\bdark\b/);

		await page.close();
	});
});
