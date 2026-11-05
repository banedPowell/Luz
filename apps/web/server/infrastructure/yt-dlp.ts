import {
	classifyYtDlpError,
	parseProgressLine,
	progressTemplate,
	thumbnailSuffix,
	ytDlpInfoSchema,
	type AnalysisErrorReason,
	type DownloadProgress,
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

export type YtDlpDownload =
	| { ok: true }
	| { ok: false; reason: AnalysisErrorReason }
	| { ok: false; reason: 'aborted' };

export interface DownloadOptions {
	/** The job folder: yt-dlp writes there only, never into the library. */
	directory: string;
	/** The file name without extension; yt-dlp adds the extension of the format it picks. */
	fileStem: string;
	signal?: AbortSignal;
	/** Every line yt-dlp prints, stdout and stderr, for the item log, except the progress lines. */
	onLine?: (line: string) => void;
	/** Each progress update, as often as yt-dlp prints one: the caller decides what to keep. */
	onProgress?: (progress: DownloadProgress) => void;
}

export interface YtDlp {
	/** Reads what a URL holds, without downloading anything. */
	analyze(url: string, options?: { signal?: AbortSignal }): Promise<YtDlpAnalysis>;
	/**
	 * Downloads the best audio of one item as the site serves it, and its thumbnail as
	 * `<fileStem>.cover.<ext>` when there is one; FFmpeg converts and tags afterwards.
	 */
	download(url: string, options: DownloadOptions): Promise<YtDlpDownload>;
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

		async download(url, { directory, fileStem, signal, onLine, onProgress }) {
			const stderr: string[] = [];
			const result = await runner.run(command, {
				args: [
					'--no-playlist',
					'--newline',
					'--progress-template',
					progressTemplate,
					'--format',
					'bestaudio/best',
					// --paths is no template, so a "%" in the data directory stays a "%"
					'--paths',
					directory,
					'--output',
					`${fileStem}.%(ext)s`,
					// A missing thumbnail is only a warning: the file then has no cover
					'--write-thumbnail',
					'--output',
					`thumbnail:${fileStem}${thumbnailSuffix}.%(ext)s`,
					'--',
					url,
				],
				signal,
				onStdoutLine: (line) => {
					const progress = parseProgressLine(line);
					if (progress) {
						onProgress?.(progress);
					} else {
						onLine?.(line);
					}
				},
				onStderrLine: (line) => {
					onLine?.(line);
					stderr.push(line);
					if (stderr.length > maxDetailLines) {
						stderr.shift();
					}
				},
			});
			if (result.outcome === 'aborted') {
				return { ok: false, reason: 'aborted' };
			}
			if (result.outcome === 'spawn-failed') {
				onLine?.(result.message);
				return { ok: false, reason: 'tool-unavailable' };
			}
			if (result.outcome !== 'exited' || result.exitCode !== 0) {
				return { ok: false, reason: classifyYtDlpError(stderr) };
			}
			return { ok: true };
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
