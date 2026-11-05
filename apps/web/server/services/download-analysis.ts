import path from 'node:path';

import {
	analysisErrorMessages,
	analyzedSourceFromYtDlp,
	audioFileExtensions,
	renderTrackPathWithoutExtension,
	type AnalysisErrorReason,
	type DownloadPreview,
	type Settings,
	type ToolStatus,
} from '@luz/core';

import type { YtDlp } from '../infrastructure/yt-dlp';

export class AnalysisError extends Error {
	constructor(
		readonly reason: AnalysisErrorReason,
		/** The yt-dlp output, for "Show details". */
		readonly details: string[] = [],
	) {
		super(analysisErrorMessages[reason]);
		this.name = 'AnalysisError';
	}
}

export interface AnalysisDependencies {
	ytDlp: YtDlp;
	/** The startup check of yt-dlp (#16), so a missing tool is reported without a run. */
	ytDlpStatus: ToolStatus;
	settings: Settings;
	/** The file names directly inside a folder, empty when there is none. */
	listFileNames: (directory: string) => Promise<string[]>;
}

/**
 * What a URL holds and where each file will land in the library, flagging those already
 * there. Nothing is downloaded and nothing is written.
 */
export async function analyzeUrl(
	url: string,
	{ ytDlp, ytDlpStatus, settings, listFileNames }: AnalysisDependencies,
	signal?: AbortSignal,
): Promise<DownloadPreview> {
	const library = settings.musicLibraryPath;
	if (library === undefined) {
		throw new AnalysisError('library-path-unset');
	}
	if (ytDlpStatus.state === 'unavailable') {
		throw new AnalysisError('tool-unavailable', [ytDlpStatus.error]);
	}

	const analysis = await ytDlp.analyze(url, { signal });
	if (!analysis.ok) {
		throw new AnalysisError(analysis.reason, analysis.details);
	}

	const source = analyzedSourceFromYtDlp(analysis.info);
	const isInLibrary = libraryLookup(library, listFileNames);
	const items = await Promise.all(
		source.items.map(async (item) => {
			const pathWithoutExtension = renderTrackPathWithoutExtension(
				settings.namingTemplate,
				item.tags,
			);
			return {
				...item,
				pathWithoutExtension,
				alreadyInLibrary: await isInLibrary(pathWithoutExtension),
			};
		}),
	);
	return { ...source, items };
}

const audioExtensions: ReadonlySet<string> = new Set(audioFileExtensions);

function stemOf(fileName: string): string {
	return fileName.slice(0, fileName.length - path.extname(fileName).length);
}

// Whether an audio file of any format has this path: the output format is not chosen yet,
// and the same track in another format is already in the library all the same. Names are
// compared without case, as Windows and macOS do, so a collision is never missed there.
// Each folder is listed once, however many items land in it.
function libraryLookup(library: string, listFileNames: AnalysisDependencies['listFileNames']) {
	const folders = new Map<string, Promise<Set<string>>>();

	function stemsIn(folder: string): Promise<Set<string>> {
		let stems = folders.get(folder);
		if (stems === undefined) {
			stems = listFileNames(path.join(library, folder)).then(
				(names) =>
					new Set(
						names
							.filter((name) => audioExtensions.has(path.extname(name).toLowerCase()))
							.map((name) => stemOf(name).toLowerCase()),
					),
			);
			folders.set(folder, stems);
		}
		return stems;
	}

	return async (relativeStem: string): Promise<boolean> => {
		const slash = relativeStem.lastIndexOf('/');
		const folder = slash === -1 ? '' : relativeStem.slice(0, slash);
		const name = relativeStem.slice(slash + 1);
		return (await stemsIn(folder)).has(name.toLowerCase());
	};
}
