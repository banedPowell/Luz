import { buildFixture, createTestContext, loadFixture, setTestContext } from '@nuxt/test-utils/e2e';

// The build runs in its own Node process: loaded inside Vitest's module runner, Nuxt's module
// resolution crashes on the runner's source-map support
const [rootDir, buildDir] = process.argv.slice(2);
if (!rootDir || !buildDir) throw new Error('Usage: build-app.mts <rootDir> <buildDir>');

setTestContext(createTestContext({ rootDir, buildDir, logLevel: 1 }));
await loadFixture();
await buildFixture();
