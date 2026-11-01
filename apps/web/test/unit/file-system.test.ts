import { mkdirSync, mkdtempSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ensureDirectory, isDirectory, walkFiles } from '../../server/infrastructure/file-system';

describe('ensureDirectory', () => {
	let root: string;

	beforeEach(() => {
		root = mkdtempSync(path.join(tmpdir(), 'luz-test-'));
	});

	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	it('creates a missing directory and its parents', () => {
		const directory = path.join(root, 'nested', 'data');

		expect(ensureDirectory(directory)).toBe(true);
		expect(statSync(directory).isDirectory()).toBe(true);
	});

	it('leaves an existing directory alone', () => {
		expect(ensureDirectory(root)).toBe(false);
		expect(statSync(root).isDirectory()).toBe(true);
	});
});

describe('walkFiles', () => {
	let root: string;

	beforeEach(() => {
		root = mkdtempSync(path.join(tmpdir(), 'luz-test-'));
	});

	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	function file(relativePath: string, content = 'x') {
		const filePath = path.join(root, relativePath);
		mkdirSync(path.dirname(filePath), { recursive: true });
		writeFileSync(filePath, content);
		return filePath;
	}

	async function walk(directory = root) {
		const entries = [];
		for await (const entry of walkFiles(directory)) {
			entries.push(entry);
		}
		return entries;
	}

	it('lists files of nested folders in name order, with size and date', async () => {
		file('b.txt', 'abc');
		file('a/2.mp3');
		file('a/1/deep.flac');

		const entries = await walk();

		expect(entries.map((entry) => path.relative(root, entry.path))).toEqual([
			path.join('a', '1', 'deep.flac'),
			path.join('a', '2.mp3'),
			'b.txt',
		]);
		const last = entries.at(-1);
		expect(last?.size).toBe(3);
		expect(last?.modifiedAtMs).toBe(Math.trunc(statSync(path.join(root, 'b.txt')).mtimeMs));
	});

	it('skips hidden files and folders', async () => {
		file('.hidden.mp3');
		file('.cache/inside.mp3');
		file('visible.mp3');

		expect((await walk()).map((entry) => path.basename(entry.path))).toEqual(['visible.mp3']);
	});

	it('does not follow a linked folder', async () => {
		const outside = mkdtempSync(path.join(tmpdir(), 'luz-test-'));
		try {
			writeFileSync(path.join(outside, 'elsewhere.mp3'), 'x');
			// A junction needs no privilege on Windows and is a plain symlink elsewhere
			symlinkSync(outside, path.join(root, 'link'), 'junction');
			file('own.mp3');

			expect((await walk()).map((entry) => path.basename(entry.path))).toEqual(['own.mp3']);
		} finally {
			rmSync(path.join(root, 'link'), { force: true });
			rmSync(outside, { recursive: true, force: true });
		}
	});

	it('yields nothing for an empty folder', async () => {
		expect(await walk()).toEqual([]);
	});

	it('rejects when the root cannot be listed', async () => {
		await expect(walk(path.join(root, 'missing'))).rejects.toThrow();
	});
});

describe('isDirectory', () => {
	let root: string;

	beforeEach(() => {
		root = mkdtempSync(path.join(tmpdir(), 'luz-test-'));
	});

	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	it('tells folders from files and missing paths', async () => {
		writeFileSync(path.join(root, 'file.mp3'), 'x');

		expect(await isDirectory(root)).toBe(true);
		expect(await isDirectory(path.join(root, 'file.mp3'))).toBe(false);
		expect(await isDirectory(path.join(root, 'missing'))).toBe(false);
	});
});
