import {
	classifyYtDlpError,
	ytDlpInfoSchema,
	type AnalysisErrorReason,
	type YtDlpInfo,
} from '@luz/core';

import type { ProcessRunner } from './process-runner';

// A flat playlist of a few hundred entries is read in seconds; past this, something is stuck
export const analysisTimeoutMs = 120_000;

// Enough of the end of the output to explain a failure, without keeping a whole log
const maxDetailLines = 50;

export type YtDlpAnalysis =
	| { ok: true; info: YtDlpInfo }
	| { ok: false; reason: AnalysisErrorReason; details: string[] };

export interface YtDlp {
	/** Reads what a URL holds, without downloading anything. */
	analyze(url: string, options?: { signal?: AbortSignal }): Promise<YtDlpAnalysis>;
}

export function createYtDlp(
	runner: ProcessRunner,
	command: string,
	timeoutMs = analysisTimeoutMs,
): YtDlp {
	return {
		async analyze(url, options = {}) {
			const stdout: string[] = [];
			const stderr: string[] = [];
			const result = await runner.run(command, {
				// "--" ends the options, so a URL can never be read as one
				args: ['--dump-single-json', '--flat-playlist', '--no-warnings', '--', url],
				timeoutMs,
				signal: options.signal,
				onStdoutLine: (line) => stdout.push(line),
				onStderrLine: (line) => {
					stderr.push(line);
					if (stderr.length > maxDetailLines) {
						stderr.shift();
					}
				},
			});

			if (result.outcome === 'spawn-failed') {
				return { ok: false, reason: 'tool-unavailable', details: [result.message] };
			}
			if (result.outcome === 'timed-out') {
				return { ok: false, reason: 'timed-out', details: stderr };
			}
			if (result.outcome !== 'exited' || result.exitCode !== 0) {
				return { ok: false, reason: classifyYtDlpError(stderr), details: stderr };
			}
			return parseInfo(stdout.join('\n'), stderr);
		},
	};
}

function parseInfo(output: string, stderr: string[]): YtDlpAnalysis {
	let json: unknown;
	try {
		json = JSON.parse(output);
	} catch {
		return { ok: false, reason: 'failed', details: [...stderr, 'yt-dlp did not print JSON.'] };
	}
	const parsed = ytDlpInfoSchema.safeParse(json);
	if (!parsed.success) {
		return {
			ok: false,
			reason: 'failed',
			details: [...stderr, `Unexpected yt-dlp output: ${parsed.error.message}`],
		};
	}
	return { ok: true, info: parsed.data };
}
