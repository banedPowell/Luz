import {
	parseToolVersion,
	toolDefinitions,
	toolNames,
	type ToolName,
	type ToolStatus,
} from '@luz/core';

import type { ProcessRunner, RunResult } from '../infrastructure/process-runner';

// A version command answers in well under a second; a slow disk or antivirus scan on
// first launch can take a few, past that the tool is reported as not answering
export const toolCheckTimeoutMs = 10_000;

export type ToolCommands = Record<ToolName, string>;

/** Runs a tool's version command and turns the outcome into a status for the user. */
export async function checkTool(
	runner: ProcessRunner,
	tool: ToolName,
	command: string,
	timeoutMs = toolCheckTimeoutMs,
): Promise<ToolStatus> {
	const { versionArgs, envVar } = toolDefinitions[tool];
	let firstLine: string | undefined;

	const result = await runner.run(command, {
		args: versionArgs,
		timeoutMs,
		onStdoutLine: (line) => {
			if (firstLine === undefined && line.trim() !== '') {
				firstLine = line;
			}
		},
	});

	if (result.outcome === 'exited' && result.exitCode === 0) {
		const version = firstLine === undefined ? undefined : parseToolVersion(tool, firstLine);
		return version === undefined
			? { tool, command, state: 'available' }
			: { tool, command, state: 'available', version };
	}
	return {
		tool,
		command,
		state: 'unavailable',
		error: describeFailure(result, envVar, timeoutMs),
	};
}

/** Checks every tool at once; one failing never hides the others. */
export function checkTools(runner: ProcessRunner, commands: ToolCommands): Promise<ToolStatus[]> {
	return Promise.all(toolNames.map((tool) => checkTool(runner, tool, commands[tool])));
}

export function pendingTools(commands: ToolCommands): ToolStatus[] {
	return toolNames.map((tool) => ({
		tool,
		command: commands[tool],
		state: 'pending',
	}));
}

function describeFailure(result: RunResult, envVar: string, timeoutMs: number): string {
	if (result.outcome === 'spawn-failed') {
		return result.code === 'ENOENT'
			? `Not found. Install it, or set ${envVar} to its full path.`
			: `Could not be started (${result.code}). Check ${envVar}.`;
	}
	if (result.outcome === 'exited') {
		return `Exited with code ${result.exitCode}. Check that ${envVar} points to the right program.`;
	}
	if (result.outcome === 'timed-out') {
		return `Did not answer within ${Math.round(timeoutMs / 1000)} s.`;
	}
	if (result.outcome === 'killed') {
		return `Stopped by the system (${result.signal}).`;
	}
	return 'The check was cancelled.';
}
