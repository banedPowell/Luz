import { readFileSync } from 'node:fs';

// Keep in sync with the PR title check in .github/workflows/pr.yml: squash
// merges reuse the PR title, but local commits should follow the same rules.
export const COMMIT_TYPES = [
	'feat',
	'fix',
	'perf',
	'refactor',
	'style',
	'test',
	'docs',
	'build',
	'ci',
	'chore',
	'revert',
] as const;

const HEADER_PATTERN = new RegExp(
	`^(?<type>${COMMIT_TYPES.join('|')})(?:\\((?<scope>[a-z0-9-]+)\\))?!?: (?<subject>.+)$`,
);

// Messages Git writes itself; rejecting them would block merges and rebases.
const GENERATED_PATTERN = /^(?:Merge |Revert "|(?:fixup|squash|amend)! )/;

/** Returns the error to show, or null when the message is valid. */
export function validateCommitMessage(message: string): string | null {
	const header = message
		.split('\n')
		.map((line) => line.trimEnd())
		.find((line) => line !== '' && !line.startsWith('#'));

	if (header === undefined) {
		return 'The commit message is empty.';
	}
	if (GENERATED_PATTERN.test(header)) {
		return null;
	}

	const match = HEADER_PATTERN.exec(header);
	const subject = match?.groups?.['subject'];
	if (subject === undefined) {
		return [
			`"${header}" does not follow Conventional Commits.`,
			'Expected "<type>(<scope>): <subject>", e.g. "feat(library): group tracks by album artist".',
			`Types: ${COMMIT_TYPES.join(', ')}.`,
		].join('\n');
	}
	if (/^[A-Z]/.test(subject)) {
		return `The subject "${subject}" must start with a lowercase letter.`;
	}
	return null;
}

if (import.meta.main) {
	const file = process.argv[2];
	if (file === undefined) {
		console.error('Usage: node scripts/check-commit-msg.ts <commit-msg-file>');
		process.exit(2);
	}
	const error = validateCommitMessage(readFileSync(file, 'utf8'));
	if (error !== null) {
		console.error(error);
		process.exit(1);
	}
}
