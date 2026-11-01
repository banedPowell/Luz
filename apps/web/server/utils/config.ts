import { homedir } from 'node:os';

import { readConfig, type LuzConfig } from '../infrastructure/config';

let config: LuzConfig | undefined;

/** The validated server configuration, read once from the environment. */
export function useLuzConfig(): LuzConfig {
	config ??= readConfig(useRuntimeConfig(), {
		platform: process.platform,
		env: process.env,
		homeDir: homedir(),
		cwd: process.cwd(),
	});
	return config;
}
