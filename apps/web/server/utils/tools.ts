import type { ToolStatus } from '@luz/core';

import { createProcessRunner } from '../infrastructure/process-runner';
import { checkTools, pendingTools, type ToolCommands } from '../services/tool-status';
import { useLuzConfig } from './config';
import { logger } from './logger';

let status: ToolStatus[] | undefined;
let check: Promise<ToolStatus[]> | undefined;

function configuredCommands(): ToolCommands {
	const config = useLuzConfig();
	return { 'yt-dlp': config.ytDlpPath, ffmpeg: config.ffmpegPath, ffprobe: config.ffprobePath };
}

/**
 * Starts the startup check of the external tools once, and logs its result. Never
 * rejects: a missing tool is a status to report, not a reason to stop the server.
 */
export function startToolCheck(): Promise<ToolStatus[]> {
	check ??= checkTools(createProcessRunner(), configuredCommands()).then((checked) => {
		status = checked;
		for (const tool of checked) {
			logTool(tool);
		}
		return checked;
	});
	return check;
}

/** The status of every tool, `pending` until the startup check has ended. */
export function useToolStatus(): ToolStatus[] {
	return status ?? pendingTools(configuredCommands());
}

function logTool(tool: ToolStatus) {
	if (tool.state === 'available') {
		logger.success(`${tool.tool} ${tool.version ?? '(unknown version)'}: ${tool.command}`);
	} else if (tool.state === 'unavailable') {
		logger.warn(`${tool.tool} unavailable (${tool.command}): ${tool.error}`);
	}
}
