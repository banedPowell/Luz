import path from 'node:path';

export interface DataDirectoryContext {
	platform: string;
	env: Readonly<Record<string, string | undefined>>;
	homeDir: string;
	cwd: string;
}

/**
 * Where Luz keeps its own data (database, cookies, caches): the configured
 * directory, or the conventional per-user application data folder of the OS.
 * Pure on purpose: every input is a parameter, so each OS can be tested from any.
 */
export function resolveDataDirectory(configured: string, context: DataDirectoryContext): string {
	// path.win32 and path.posix behave the same on every host, unlike plain `path`
	const paths = context.platform === 'win32' ? path.win32 : path.posix;

	if (configured !== '') {
		return paths.resolve(context.cwd, configured);
	}

	switch (context.platform) {
		case 'win32': {
			return paths.join(
				absoluteOrUndefined(paths, context.env.APPDATA) ??
					paths.join(context.homeDir, 'AppData', 'Roaming'),
				'Luz',
			);
		}
		case 'darwin': {
			return paths.join(context.homeDir, 'Library', 'Application Support', 'Luz');
		}
		default: {
			// The XDG spec says relative values must be ignored
			return paths.join(
				absoluteOrUndefined(paths, context.env.XDG_DATA_HOME) ??
					paths.join(context.homeDir, '.local', 'share'),
				'luz',
			);
		}
	}
}

function absoluteOrUndefined(
	paths: path.PlatformPath,
	value: string | undefined,
): string | undefined {
	return value !== undefined && paths.isAbsolute(value) ? value : undefined;
}
