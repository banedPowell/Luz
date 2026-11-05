import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createPage, setup } from '@nuxt/test-utils/e2e';
import { afterAll, describe, expect, it } from 'vitest';
import { missingTools, sharedBuild } from './build';

// The built server opens a database: keep it away from the user's
const dataDir = mkdtempSync(path.join(tmpdir(), 'luz-e2e-'));

afterAll(() => {
	rmSync(dataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});

// Settings sits at the bottom of the sidebar, in its own landmark
const links = [
	{ navigation: 'Main', name: 'Home' },
	{ navigation: 'Main', name: 'Library' },
	{ navigation: 'Main', name: 'Downloads' },
	{ navigation: 'Secondary', name: 'Settings' },
];

describe('app shell in a browser', async () => {
	await setup({
		...sharedBuild,
		env: { NUXT_DATA_DIR: dataDir, ...missingTools },
		browser: true,
	});

	it('collapses and expands the sidebar, keeping an accessible name on every link', async () => {
		const page = await createPage('/');

		await page.getByRole('button', { name: 'Close sidebar' }).click();
		const toggle = page.getByRole('button', { name: 'Open sidebar' });
		expect(await toggle.getAttribute('aria-expanded')).toBe('false');

		for (const { navigation, name } of links) {
			const link = page
				.getByRole('navigation', { name: navigation })
				.getByRole('link', { name, exact: true });
			await link.waitFor();
			// Collapsed, the link shows its icon only: its name must come from elsewhere
			expect(await link.innerText()).toBe('');
		}

		await toggle.click();
		expect(
			await page.getByRole('button', { name: 'Close sidebar' }).getAttribute('aria-expanded'),
		).toBe('true');
		for (const { navigation, name } of links) {
			const link = page
				.getByRole('navigation', { name: navigation })
				.getByRole('link', { name, exact: true });
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

		// Settings and the theme switch come with the drawer, at its bottom
		await page.getByRole('button', { name: 'Open sidebar' }).click();
		await menu.getByRole('group', { name: 'Theme' }).waitFor();
		await menu.getByRole('link', { name: 'Settings', exact: true }).click();
		await page.waitForURL('**/settings');
		await menu.waitFor({ state: 'hidden' });

		await page.close();
	});

	it('keeps the sidebar beside the page from the md breakpoint up', async () => {
		// 768 px is md: a tablet gets the inset sidebar, not the drawer
		const page = await createPage('/', { viewport: { width: 768, height: 1024 } });

		await page
			.getByRole('navigation', { name: 'Main' })
			.getByRole('link', { name: 'Home' })
			.waitFor();
		expect(await page.getByRole('dialog').count()).toBe(0);
		expect(
			await page.getByRole('button', { name: 'Close sidebar' }).getAttribute('aria-expanded'),
		).toBe('true');

		await page.close();
	});

	it('keeps the theme in this browser across a reload', async () => {
		const page = await createPage('/');
		await page.getByRole('button', { name: 'Dark theme' }).click();
		await page.waitForSelector('html.dark', { state: 'attached' });

		// Read back from the cookie: nothing else stores it
		await page.reload();
		await page.waitForSelector('html.dark', { state: 'attached' });
		await page.getByRole('button', { name: 'Dark theme', pressed: true }).waitFor();

		await page.close();
	});

	it('switches between light and dark and the dark class on <html> follows', async () => {
		const page = await createPage('/');
		const group = page.getByRole('group', { name: 'Theme' });
		// Order and names of the pill: light, dark, system
		expect(await group.getByRole('button').count()).toBe(3);
		expect(await group.getByRole('button').nth(0).getAttribute('aria-label')).toBe(
			'Light theme',
		);
		expect(await group.getByRole('button').nth(2).getAttribute('aria-label')).toBe(
			'System theme',
		);

		// Selectors rather than page.evaluate: this test is type checked without the DOM library
		await group.getByRole('button', { name: 'Dark theme' }).click();
		await page.waitForSelector('html.dark', { state: 'attached' });

		// Keyboard: the buttons are tab stops and Enter applies the theme
		await group.getByRole('button', { name: 'Light theme' }).focus();
		await page.keyboard.press('Enter');
		await page.waitForSelector('html:not(.dark)', { state: 'attached' });
		expect(await page.locator('html').getAttribute('class')).not.toMatch(/dark/);
		await group.getByRole('button', { name: 'Light theme', pressed: true }).waitFor();
		expect(
			await group.getByRole('button', { name: 'Dark theme' }).getAttribute('aria-pressed'),
		).toBe('false');

		await page.close();
	});
});
