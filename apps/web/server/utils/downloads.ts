import path from 'node:path';

import type { ToolStatus } from '@luz/core';

import { createDirectory, listFileNames, removeDirectory } from '../infrastructure/file-system';
import { createProcessRunner } from '../infrastructure/process-runner';
import { createYtDlp } from '../infrastructure/yt-dlp';
import type { AnalysisDependencies } from '../services/download-analysis';
import { createDownloadQueue, type DownloadQueue } from '../services/downloads';
import { getSettings } from '../services/settings';
import { useLuzConfig } from './config';
import { useDatabase } from './database';
import { logger } from './logger';
import { useToolStatus } from './tools';

let queue: Promise<DownloadQueue> | undefined;

/** The download queue of the server, created once the database is ready. */
export function useDownloadQueue(): Promise<DownloadQueue> {
	queue ??= useDatabase().then((db) => {
		const { dataDir, ytDlpPath } = useLuzConfig();
		return createDownloadQueue({
			db,
			ytDlp: createYtDlp(createProcessRunner(), ytDlpPath),
			downloadsDirectory: path.join(dataDir, 'downloads'),
			createDirectory,
			removeDirectory,
			logger,
		});
	});
	return queue;
}

/** What an analysis needs, from the configuration, the tool check and the settings. */
export async function useAnalysisDependencies(): Promise<AnalysisDependencies> {
	const { ytDlpPath } = useLuzConfig();
	const ytDlpStatus: ToolStatus = useToolStatus().find((tool) => tool.tool === 'yt-dlp') ?? {
		tool: 'yt-dlp',
		command: ytDlpPath,
		state: 'pending',
	};
	return {
		ytDlp: createYtDlp(createProcessRunner(), ytDlpPath),
		ytDlpStatus,
		settings: await getSettings(await useDatabase()),
		listFileNames,
	};
}
