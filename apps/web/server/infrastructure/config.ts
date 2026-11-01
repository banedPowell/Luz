import { serverConfigSchema, type ServerConfig } from '@luz/core';

import { resolveDataDirectory, type DataDirectoryContext } from './data-directory';

/** The server configuration, with the data directory resolved to an absolute path. */
export type LuzConfig = ServerConfig;

export function readConfig(runtimeConfig: unknown, context: DataDirectoryContext): LuzConfig {
	const result = serverConfigSchema.safeParse(runtimeConfig);
	if (!result.success) {
		const problems = result.error.issues.map(
			(issue) => `- ${issue.path.map(String).join('.')}: ${issue.message}`,
		);
		throw new Error(
			`Invalid configuration, check the NUXT_* environment variables:\n${problems.join('\n')}`,
		);
	}
	return {
		...result.data,
		dataDir: resolveDataDirectory(result.data.dataDir, context),
	};
}
