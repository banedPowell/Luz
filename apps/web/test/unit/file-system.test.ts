import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ensureDirectory } from '../../server/infrastructure/file-system';

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
