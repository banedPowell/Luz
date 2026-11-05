// The external programs Luz runs, checked at startup (ADR 0003) and reached only through adapters
export const toolNames = ['yt-dlp', 'ffmpeg', 'ffprobe'] as const;

export type ToolName = (typeof toolNames)[number];

export interface ToolDefinition {
	/** The arguments that print the version and exit at once. */
	versionArgs: readonly string[];
	/** The variable that configures the command, named in the error a user sees. */
	envVar: string;
}

export const toolDefinitions: Record<ToolName, ToolDefinition> = {
	'yt-dlp': { versionArgs: ['--version'], envVar: 'NUXT_YT_DLP_PATH' },
	ffmpeg: { versionArgs: ['-version'], envVar: 'NUXT_FFMPEG_PATH' },
	ffprobe: { versionArgs: ['-version'], envVar: 'NUXT_FFPROBE_PATH' },
};

/**
 * What Luz knows about one tool: `pending` until the startup check ends, then
 * `available` (with its version when the output gave one) or `unavailable` with a
 * message meant for the user.
 */
export type ToolStatus =
	| { tool: ToolName; command: string; state: 'pending' }
	| { tool: ToolName; command: string; state: 'available'; version?: string }
	| { tool: ToolName; command: string; state: 'unavailable'; error: string };

// FFmpeg and ffprobe start with "ffmpeg version 7.1.1 Copyright ..."; builds may use
// "N-12345-g…" or "2025-01-01-git-…" as their version, so anything up to a space counts.
// The name must match, so the version shown is never another program's.
const ffmpegVersion = { ffmpeg: /^ffmpeg version (\S+)/, ffprobe: /^ffprobe version (\S+)/ };

// yt-dlp prints only its version, such as 2025.10.22
const ytDlpVersion = /^\d{4}\.\d{2}\.\d{2}(?:\.\d+)?$/;

/** The version found in the first line a tool printed for its version command. */
export function parseToolVersion(tool: ToolName, firstLine: string): string | undefined {
	const line = firstLine.trim();
	if (tool === 'yt-dlp') {
		return ytDlpVersion.test(line) ? line : undefined;
	}
	return ffmpegVersion[tool].exec(line)?.[1];
}
