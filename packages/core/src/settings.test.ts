import { describe, expect, it } from 'vite-plus/test';

import { defaultSettings, settingsSchema, themeSchema } from './settings.ts';

describe('themeSchema', () => {
	it.each(['system', 'light', 'dark'])('accepts %j', (theme) => {
		expect(themeSchema.parse(theme)).toBe(theme);
	});

	it.each(['auto', 'Dark', '', null, 1])('rejects %j', (theme) => {
		expect(themeSchema.safeParse(theme).success).toBe(false);
	});
});

describe('settingsSchema', () => {
	it('fills in the defaults for an empty object', () => {
		expect(settingsSchema.parse({})).toEqual({ theme: 'system' });
	});

	it('keeps valid values', () => {
		expect(settingsSchema.parse({ theme: 'dark', musicLibraryPath: '/music' })).toEqual({
			theme: 'dark',
			musicLibraryPath: '/music',
		});
	});

	it('trims the library path', () => {
		expect(settingsSchema.parse({ musicLibraryPath: '  D:Music  ' }).musicLibraryPath).toBe(
			'D:Music',
		);
	});

	it.each([
		{ theme: 'auto' },
		{ musicLibraryPath: '' },
		{ musicLibraryPath: '   ' },
		{ musicLibraryPath: 42 },
	])('rejects %j', (input) => {
		expect(settingsSchema.safeParse(input).success).toBe(false);
	});

	it('rejects a non-object', () => {
		expect(settingsSchema.safeParse('dark').success).toBe(false);
	});
});

describe('defaultSettings', () => {
	it('uses the system theme and no library path', () => {
		expect(defaultSettings).toEqual({ theme: 'system' });
		expect('musicLibraryPath' in defaultSettings).toBe(false);
	});
});
