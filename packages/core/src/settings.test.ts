import { describe, expect, it } from 'vite-plus/test';

import { defaultNamingTemplate } from './naming.ts';
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
		expect(settingsSchema.parse({})).toEqual({ namingTemplate: defaultNamingTemplate });
	});

	it('keeps valid values', () => {
		expect(
			settingsSchema.parse({ musicLibraryPath: '/music', namingTemplate: '{album}/{title}' }),
		).toEqual({ musicLibraryPath: '/music', namingTemplate: '{album}/{title}' });
	});

	it('trims the library path', () => {
		expect(settingsSchema.parse({ musicLibraryPath: '  D:\\Music  ' }).musicLibraryPath).toBe(
			'D:\\Music',
		);
	});

	it.each([
		{ musicLibraryPath: '' },
		{ musicLibraryPath: '   ' },
		{ musicLibraryPath: 42 },
		{ musicLibraryPath: 'Music' },
		{ namingTemplate: '{genre}' },
		{ namingTemplate: '../{title}' },
	])('rejects %j', (input) => {
		expect(settingsSchema.safeParse(input).success).toBe(false);
	});

	it('rejects a non-object', () => {
		expect(settingsSchema.safeParse('dark').success).toBe(false);
	});
});

describe('defaultSettings', () => {
	it('has no library path and the default naming template', () => {
		expect(defaultSettings).toEqual({ namingTemplate: defaultNamingTemplate });
		expect('musicLibraryPath' in defaultSettings).toBe(false);
	});
});

describe('settingsPatchSchema', () => {
	it('accepts an empty patch without applying defaults', () => {
		expect(settingsPatchSchema.parse({})).toEqual({});
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

	it('trims the naming template', () => {
		expect(settingsPatchSchema.parse({ namingTemplate: ' {title} ' })).toEqual({
			namingTemplate: '{title}',
		});
	});

	it('clears the library path with null', () => {
		expect(settingsPatchSchema.parse({ musicLibraryPath: null })).toEqual({
			musicLibraryPath: null,
		});
	});

	it.each([
		// A browser preference, kept in a cookie (ADR 0006)
		{ theme: 'dark' },
		{ musicLibraryPath: '' },
		{ musicLibraryPath: '   ' },
		{ musicLibraryPath: 42 },
		{ musicLibraryPath: 'Music' },
		{ musicLibraryPath: './Music' },
		{ musicLibraryPath: 'D:Music' },
		{ volume: 3 },
		{ namingTemplate: null },
		{ namingTemplate: '' },
		{ namingTemplate: '/{title}' },
	])('rejects %j', (input) => {
		expect(settingsPatchSchema.safeParse(input).success).toBe(false);
	});

	it('rejects a non-object', () => {
		expect(settingsPatchSchema.safeParse(null).success).toBe(false);
	});
});
