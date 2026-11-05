import { spawn } from 'node:child_process';
import type { Readable } from 'node:stream';
import { StringDecoder } from 'node:string_decoder';

export interface RunOptions {
	/** Passed as they are, never through a shell: no quoting, no injection. */
	args: readonly string[];
	/** Kills the process once it has run this long. */
	timeoutMs?: number;
	/** Kills the process when aborted; an already aborted signal spawns nothing. */
	signal?: AbortSignal;
	cwd?: string;
	onStdoutLine?: (line: string) => void;
	onStderrLine?: (line: string) => void;
}

/**
 * How a run ended. `spawn-failed` means the program never started: `code` is the
 * system error, `ENOENT` when the command is not found.
 */
export type RunResult =
	| { outcome: 'exited'; exitCode: number }
	| { outcome: 'timed-out' }
	| { outcome: 'aborted' }
	| { outcome: 'killed'; signal: string }
	| { outcome: 'spawn-failed'; code: string; message: string };

/** The only way Luz starts a process; every tool adapter goes through it. */
export interface ProcessRunner {
	run(command: string, options: RunOptions): Promise<RunResult>;
}

export function createProcessRunner(): ProcessRunner {
	return { run: runProcess };
}

function runProcess(command: string, options: RunOptions): Promise<RunResult> {
	const { args, timeoutMs, signal, cwd, onStdoutLine, onStderrLine } = options;
	if (signal?.aborted) {
		return Promise.resolve({ outcome: 'aborted' });
	}

	return new Promise((resolve) => {
		// No shell, even on Windows: spawn finds a bare name on PATH by itself, and arguments
		// never get reinterpreted. stdin is closed so a tool waiting for input ends at once.
		const child = spawn(command, args, {
			cwd,
			shell: false,
			windowsHide: true,
			stdio: ['ignore', 'pipe', 'pipe'],
		});

		let stopReason: 'timed-out' | 'aborted' | undefined;
		let settled = false;

		// SIGKILL rather than SIGTERM: a stopped job has nothing to save, and the process must
		// not outlive the request that started it. Windows terminates the process either way.
		function stop(reason: 'timed-out' | 'aborted') {
			stopReason ??= reason;
			child.kill('SIGKILL');
		}

		const timer =
			timeoutMs === undefined ? undefined : setTimeout(() => stop('timed-out'), timeoutMs);
		const onAbort = () => stop('aborted');
		signal?.addEventListener('abort', onAbort, { once: true });

		function finish(result: RunResult) {
			if (settled) {
				return;
			}
			settled = true;
			clearTimeout(timer);
			signal?.removeEventListener('abort', onAbort);
			resolve(result);
		}

		readLines(child.stdout, onStdoutLine);
		readLines(child.stderr, onStderrLine);

		child.once('error', (error: NodeJS.ErrnoException) => {
			// Also emitted when kill() fails on a process that already ended: 'close' follows then
			if (child.pid === undefined) {
				finish({
					outcome: 'spawn-failed',
					code: error.code ?? 'UNKNOWN',
					message: error.message,
				});
			}
		});

		// 'close' rather than 'exit': it comes once stdout and stderr are fully read
		child.once('close', (exitCode, exitSignal) => {
			if (stopReason) {
				finish({ outcome: stopReason });
			} else if (exitCode !== null) {
				finish({ outcome: 'exited', exitCode });
			} else {
				finish({ outcome: 'killed', signal: exitSignal ?? 'UNKNOWN' });
			}
		});
	});
}

// Splits on \n and drops a trailing \r, so Windows line endings give the same lines.
// The decoder keeps a multi-byte character cut between two chunks whole.
function readLines(stream: Readable, onLine: ((line: string) => void) | undefined) {
	const decoder = new StringDecoder('utf8');
	let pending = '';

	function emit(line: string) {
		onLine?.(line.endsWith('\r') ? line.slice(0, -1) : line);
	}

	stream.on('data', (chunk: Buffer) => {
		const lines = (pending + decoder.write(chunk)).split('\n');
		pending = lines.pop() ?? '';
		for (const line of lines) {
			emit(line);
		}
	});
	stream.once('end', () => {
		const rest = pending + decoder.end();
		if (rest !== '') {
			emit(rest);
		}
	});
}
