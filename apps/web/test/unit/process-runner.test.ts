import { describe, expect, it } from 'vitest';

import { createProcessRunner, type RunOptions } from '../../server/infrastructure/process-runner';

// Node itself, with tiny inline scripts: never the real tools
const node = process.execPath;
const runner = createProcessRunner();

function runScript(script: string, options: Omit<RunOptions, 'args'> = {}) {
	return runner.run(node, { ...options, args: ['-e', script] });
}

// Keeps the process alive until it is killed
const forever = 'setInterval(() => {}, 1000);';

describe('process runner', () => {
	it('reads stdout and stderr line by line and returns the exit code', async () => {
		const stdout: string[] = [];
		const stderr: string[] = [];

		const result = await runScript(
			`process.stdout.write('one\\r\\ntw'); setTimeout(() => { process.stdout.write('o\\nlast'); process.stderr.write('oops\\n'); process.exit(3); }, 20);`,
			{
				onStdoutLine: (line) => stdout.push(line),
				onStderrLine: (line) => stderr.push(line),
			},
		);

		expect(result).toEqual({ outcome: 'exited', exitCode: 3 });
		expect(stdout).toEqual(['one', 'two', 'last']);
		expect(stderr).toEqual(['oops']);
	});

	it('keeps a character split between two chunks whole', async () => {
		const lines: string[] = [];

		await runScript(
			`const bytes = Buffer.from('é\\n'); process.stdout.write(bytes.subarray(0, 1)); setTimeout(() => process.stdout.write(bytes.subarray(1)), 20);`,
			{ onStdoutLine: (line) => lines.push(line) },
		);

		expect(lines).toEqual(['é']);
	});

	it('passes arguments as they are, without a shell', async () => {
		const lines: string[] = [];

		await runner.run(node, {
			args: [
				'-e',
				'console.log(JSON.stringify(process.argv.slice(1)))',
				'"a b"',
				'$HOME',
				'&&',
			],
			onStdoutLine: (line) => lines.push(line),
		});

		expect(JSON.parse(lines[0] ?? '')).toEqual(['"a b"', '$HOME', '&&']);
	});

	it('kills a process that runs past its timeout', async () => {
		const started = Date.now();

		const result = await runScript(forever, { timeoutMs: 200 });

		expect(result).toEqual({ outcome: 'timed-out' });
		expect(Date.now() - started).toBeLessThan(5000);
	});

	it('kills the process when the signal is aborted', async () => {
		const controller = new AbortController();
		const lines: string[] = [];

		const result = await runScript(`console.log('ready'); ${forever}`, {
			signal: controller.signal,
			onStdoutLine: (line) => {
				lines.push(line);
				controller.abort();
			},
		});

		expect(result).toEqual({ outcome: 'aborted' });
		expect(lines).toEqual(['ready']);
	});

	it('spawns nothing when the signal is already aborted', async () => {
		const lines: string[] = [];

		const result = await runScript(`console.log('ran')`, {
			signal: AbortSignal.abort(),
			onStdoutLine: (line) => lines.push(line),
		});

		expect(result).toEqual({ outcome: 'aborted' });
		expect(lines).toEqual([]);
	});

	it('reports a command that cannot be found', async () => {
		const result = await runner.run('luz-test-command-that-does-not-exist', { args: [] });

		expect(result).toMatchObject({ outcome: 'spawn-failed', code: 'ENOENT' });
	});
});
