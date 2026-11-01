import { describe, expect, it } from 'vite-plus/test';

import { defaultSettings, settingsPatchSchema, settingsSchema, themeSchema } from './settings.ts';

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
		expect(settingsSchema.parse({ musicLibraryPath: '  D:\\Music  ' }).musicLibraryPath).toBe(
			'D:\\Music',
		);
	});

	it.each([
		{ theme: 'auto' },
		{ musicLibraryPath: '' },
		{ musicLibraryPath: '   ' },
		{ musicLibraryPath: 42 },
		{ musicLibraryPath: 'Music' },
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

describe('settingsPatchSchema', () => {
	it('accepts an empty patch without applying defaults', () => {
		expect(settingsPatchSchema.parse({})).toEqual({});
	});

	it('keeps the given keys only', () => {
		expect(settingsPatchSchema.parse({ theme: 'light' })).toEqual({ theme: 'light' });
	});

	it('trims the library path', () => {
		expect(settingsPatchSchema.parse({ musicLibraryPath: ' /music ' })).toEqual({
			musicLibraryPath: '/music',
		});
	});

	it.each(['/home/me/Music', 'D:\\Music', 'd:/Music', '\\\\nas\\music'])(
		'accepts the absolute path %j',
		(musicLibraryPath) => {
			expect(settingsPatchSchema.parse({ musicLibraryPath })).toEqual({ musicLibraryPath });
		},
	);

	it('clears the library path with null', () => {
		expect(settingsPatchSchema.parse({ musicLibraryPath: null })).toEqual({
			musicLibraryPath: null,
		});
	});

	it.each([
		{ theme: 'auto' },
		{ theme: null },
		{ musicLibraryPath: '' },
		{ musicLibraryPath: '   ' },
		{ musicLibraryPath: 42 },
		{ musicLibraryPath: 'Music' },
		{ musicLibraryPath: './Music' },
		{ musicLibraryPath: 'D:Music' },
		{ volume: 3 },
	])('rejects %j', (input) => {
		expect(settingsPatchSchema.safeParse(input).success).toBe(false);
	});

	it('rejects a non-object', () => {
		expect(settingsPatchSchema.safeParse(null).success).toBe(false);
	});
});
