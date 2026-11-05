import { describe, expect, it } from 'vitest';

import type {
	ProcessRunner,
	RunOptions,
	RunResult,
} from '../../server/infrastructure/process-runner';
import { checkTool, checkTools, pendingTools } from '../../server/services/tool-status';

interface Script {
	lines?: string[];
	result: RunResult;
}

// Answers each command with scripted output, and records how it was called
function fakeRunner(scripts: Record<string, Script>) {
	const calls: { command: string; options: RunOptions }[] = [];
	const runner: ProcessRunner = {
		async run(command, options) {
			calls.push({ command, options });
			const script = scripts[command];
			if (!script) {
				return {
					outcome: 'spawn-failed',
					code: 'ENOENT',
					message: `spawn ${command} ENOENT`,
				};
			}
			for (const line of script.lines ?? []) {
				options.onStdoutLine?.(line);
			}
			return script.result;
		},
	};
	return { runner, calls };
}

const exited = (exitCode: number): RunResult => ({ outcome: 'exited', exitCode });

const commands = { 'yt-dlp': 'yt-dlp', ffmpeg: '/opt/ffmpeg', ffprobe: 'ffprobe' };

describe('tool status', () => {
	it('runs each version command with a timeout and reads the version', async () => {
		const { runner, calls } = fakeRunner({
			'yt-dlp': { lines: ['2025.10.22'], result: exited(0) },
			'/opt/ffmpeg': {
				lines: ['', 'ffmpeg version 7.1.1 Copyright (c) 2000-2025', 'built with gcc'],
				result: exited(0),
			},
			ffprobe: { lines: ['ffprobe version 7.1.1 Copyright'], result: exited(0) },
		});

		expect(await checkTools(runner, commands)).toEqual([
			{ tool: 'yt-dlp', command: 'yt-dlp', state: 'available', version: '2025.10.22' },
			{ tool: 'ffmpeg', command: '/opt/ffmpeg', state: 'available', version: '7.1.1' },
			{ tool: 'ffprobe', command: 'ffprobe', state: 'available', version: '7.1.1' },
		]);
		expect(calls.map(({ command, options }) => [command, options.args])).toEqual([
			['yt-dlp', ['--version']],
			['/opt/ffmpeg', ['-version']],
			['ffprobe', ['-version']],
		]);
		expect(calls.every(({ options }) => options.timeoutMs !== undefined)).toBe(true);
	});

	it('reports a missing tool without hiding the others', async () => {
		const { runner } = fakeRunner({
			'yt-dlp': { lines: ['2025.10.22'], result: exited(0) },
			ffprobe: { lines: ['ffprobe version 7.1 Copyright'], result: exited(0) },
		});

		const status = await checkTools(runner, commands);

		expect(status.map((tool) => tool.state)).toEqual(['available', 'unavailable', 'available']);
		expect(status[1]).toEqual({
			tool: 'ffmpeg',
			command: '/opt/ffmpeg',
			state: 'unavailable',
			error: 'Not found. Install it, or set NUXT_FFMPEG_PATH to its full path.',
		});
	});

	it.each([
		[exited(1), 'Exited with code 1. Check that NUXT_YT_DLP_PATH points to the right program.'],
		[{ outcome: 'timed-out' } as const, 'Did not answer within 2 s.'],
		[{ outcome: 'killed', signal: 'SIGSEGV' } as const, 'Stopped by the system (SIGSEGV).'],
		[
			{ outcome: 'spawn-failed', code: 'EACCES', message: 'spawn EACCES' } as const,
			'Could not be started (EACCES). Check NUXT_YT_DLP_PATH.',
		],
	])('reports %j as unavailable', async (result, error) => {
		const { runner } = fakeRunner({ 'yt-dlp': { result } });

		expect(await checkTool(runner, 'yt-dlp', 'yt-dlp', 2000)).toEqual({
			tool: 'yt-dlp',
			command: 'yt-dlp',
			state: 'unavailable',
			error,
		});
	});

	it('keeps a tool that answers without a recognisable version available', async () => {
		const { runner } = fakeRunner({ 'yt-dlp': { lines: ['custom build'], result: exited(0) } });

		expect(await checkTool(runner, 'yt-dlp', 'yt-dlp')).toEqual({
			tool: 'yt-dlp',
			command: 'yt-dlp',
			state: 'available',
		});
	});

	it('lists every tool as pending before the check', () => {
		expect(pendingTools(commands)).toEqual([
			{ tool: 'yt-dlp', command: 'yt-dlp', state: 'pending' },
			{ tool: 'ffmpeg', command: '/opt/ffmpeg', state: 'pending' },
			{ tool: 'ffprobe', command: 'ffprobe', state: 'pending' },
		]);
	});
});
