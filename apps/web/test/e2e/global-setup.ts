import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildDir, rootDir } from './build';

// Builds the app once for every e2e file, which then start their own server from the output
export default function setup() {
	rmSync(buildDir, { recursive: true, force: true });
	execFileSync(
		process.execPath,
		[fileURLToPath(new URL('build-app.mts', import.meta.url)), rootDir, buildDir],
		{ stdio: 'inherit' },
	);

	return () => {
		rmSync(buildDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
	};
}
