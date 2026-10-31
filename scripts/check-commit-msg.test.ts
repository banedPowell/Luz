import { describe, expect, it } from 'vite-plus/test';

import { validateCommitMessage } from './check-commit-msg.ts';

describe('validateCommitMessage', () => {
	it.each([
		'feat: add the download queue',
		'fix(library): keep track numbers when rescanning',
		'feat!: drop the legacy settings format',
		'chore(deps)!: bump nuxt',
		'docs: explain 12-factor config\n\nLonger body.\n\nCloses #5',
		'# Git comment first\nci: cache vite task results',
	])('accepts %j', (message) => {
		expect(validateCommitMessage(message)).toBeNull();
	});

	it.each([
		"Merge branch 'dev' into feat/12-download-queue",
		'Revert "feat: add the download queue"',
		'fixup! feat: add the download queue',
		'squash! fix: handle empty tags',
	])('lets Git-generated message %j through', (message) => {
		expect(validateCommitMessage(message)).toBeNull();
	});

	it.each([
		['add download queue', 'Conventional Commits'],
		['feature: add download queue', 'Conventional Commits'],
		['feat:add download queue', 'Conventional Commits'],
		['feat(Library): add download queue', 'Conventional Commits'],
		['feat: Add download queue', 'lowercase'],
	])('rejects %j', (message, reason) => {
		expect(validateCommitMessage(message)).toContain(reason);
	});

	it('rejects a message made only of comments', () => {
		expect(validateCommitMessage('# Please enter the commit message\n\n')).toBe(
			'The commit message is empty.',
		);
	});
});
