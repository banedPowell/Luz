import { describe, expect, it } from 'vitest';

import {
	resolveDataDirectory,
	type DataDirectoryContext,
} from '../../server/infrastructure/data-directory';

const windows: DataDirectoryContext = {
	platform: 'win32',
	env: { APPDATA: 'C:\\Users\\ada\\AppData\\Roaming' },
	homeDir: 'C:\\Users\\ada',
	cwd: 'C:\\projects\\luz\\apps\\web',
};

const macos: DataDirectoryContext = {
	platform: 'darwin',
	env: {},
	homeDir: '/Users/ada',
	cwd: '/Users/ada/luz',
};

const linux: DataDirectoryContext = {
	platform: 'linux',
	env: {},
	homeDir: '/home/ada',
	cwd: '/home/ada/luz',
};

describe('resolveDataDirectory on Windows', () => {
	it('uses %APPDATA%\\Luz by default', () => {
		expect(resolveDataDirectory('', windows)).toBe('C:\\Users\\ada\\AppData\\Roaming\\Luz');
	});

	it('falls back to the roaming folder in the home directory without APPDATA', () => {
		expect(resolveDataDirectory('', { ...windows, env: {} })).toBe(
			'C:\\Users\\ada\\AppData\\Roaming\\Luz',
		);
	});

	it('ignores a relative APPDATA', () => {
		expect(resolveDataDirectory('', { ...windows, env: { APPDATA: 'Roaming' } })).toBe(
			'C:\\Users\\ada\\AppData\\Roaming\\Luz',
		);
	});

	it('keeps an absolute configured directory', () => {
		expect(resolveDataDirectory('D:\\luz-data', windows)).toBe('D:\\luz-data');
	});

	it('resolves a relative configured directory from the working directory', () => {
		expect(resolveDataDirectory('.luz', windows)).toBe('C:\\projects\\luz\\apps\\web\\.luz');
	});

	it('normalises forward slashes', () => {
		expect(resolveDataDirectory('D:/luz/data/', windows)).toBe('D:\\luz\\data');
	});
});

describe('resolveDataDirectory on macOS', () => {
	it('uses ~/Library/Application Support/Luz by default', () => {
		expect(resolveDataDirectory('', macos)).toBe('/Users/ada/Library/Application Support/Luz');
	});

	it('ignores XDG_DATA_HOME', () => {
		expect(resolveDataDirectory('', { ...macos, env: { XDG_DATA_HOME: '/data' } })).toBe(
			'/Users/ada/Library/Application Support/Luz',
		);
	});

	it('resolves a relative configured directory from the working directory', () => {
		expect(resolveDataDirectory('data/../.luz', macos)).toBe('/Users/ada/luz/.luz');
	});
});

describe('resolveDataDirectory on Linux and other systems', () => {
	it('uses ~/.local/share/luz by default', () => {
		expect(resolveDataDirectory('', linux)).toBe('/home/ada/.local/share/luz');
	});

	it('uses $XDG_DATA_HOME/luz when it is absolute', () => {
		expect(resolveDataDirectory('', { ...linux, env: { XDG_DATA_HOME: '/data' } })).toBe(
			'/data/luz',
		);
	});

	it('ignores a relative XDG_DATA_HOME, as the XDG spec requires', () => {
		expect(resolveDataDirectory('', { ...linux, env: { XDG_DATA_HOME: 'data' } })).toBe(
			'/home/ada/.local/share/luz',
		);
	});

	it('ignores an empty XDG_DATA_HOME', () => {
		expect(resolveDataDirectory('', { ...linux, env: { XDG_DATA_HOME: '' } })).toBe(
			'/home/ada/.local/share/luz',
		);
	});

	it('applies the same rules to other Unix systems', () => {
		expect(resolveDataDirectory('', { ...linux, platform: 'freebsd' })).toBe(
			'/home/ada/.local/share/luz',
		);
	});

	it('keeps an absolute configured directory', () => {
		expect(resolveDataDirectory('/var/lib/luz', linux)).toBe('/var/lib/luz');
	});
});
