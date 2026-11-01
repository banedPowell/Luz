# Pitfalls

Traps already met while building Luz, with their cause and the fix. Read only the sections that touch your task. Add an entry when you lose time on something the next agent would hit too; remove it when the cause is gone.

## Tooling

- **TypeScript stays on 6.x.** `nuxt typecheck` runs vue-tsc, which needs the TypeScript JS API that TS 7 dropped.
- **Oxlint warnings do not fail `vp check`**, hence `correctness: 'error'`. An empty file or a lone `export {}` is rejected (`unicorn/no-empty-file`, `require-module-specifiers`). Never disable a rule to get green.
- **Oxlint's type-check cannot resolve `.vue` imports from `.ts` files** (TS2307 in `vp check` while vue-tsc passes). In tests, import components from `#components`.
- **Oxfmt also formats Markdown and YAML**: a first `vp check --fix` can realign existing tables. Mention it in the PR.
- **`LICENSE.md` is excluded from formatting** to keep the PolyForm text intact. Do not touch it.
- **pnpm blocks dependency build scripts**: allow (or explicitly refuse, like `vue-demi`) them in `allowBuilds` of `pnpm-workspace.yaml`, and justify it in the PR.
- **"unmet peer vite"** means `vite` or `vitest` is no longer on `catalog:`; the catalog and overrides from `vp migrate` fix it.
- **Stale auto-import types after a pull**: `vp check` fails with TS2304 (`Cannot find name 'useSettings'`) on untouched files. `vp install` does not regenerate `.nuxt` when nothing changes; run `npx nuxt prepare` in `apps/web`. Same after changing `nitro.typescript` config.
- **`core` imports its own files with a `.ts` extension** (`allowImportingTsExtensions`), since it is consumed from sources. Its tsconfig has no Node or DOM types on purpose: a `node:*` import fails the typecheck.

## Tests

- **Vitest 5 no longer looks for a config in parent folders**: a package with its own `vitest.config.ts` must be listed in `test.projects` of the root `vite.config.ts`.
- **`@nuxt/test-utils` detects Vitest from the cwd** (the repo root): keep `vitest: catalog:` in the root devDependencies, or it falls back to `vitest/environments`, which Vitest 5 does not export.
- **Nuxt tests run from the root** need `environmentOptions.nuxt.rootDir` pointing to `apps/web` ("Cannot resolve module @nuxt/kit" otherwise).
- **Nuxt UI components with tooltips or overlays** need the `UApp` provider: mount them inside a `UApp` in tests, or `UTooltip` crashes ("reading 'text' of undefined").
- **`error.vue` cannot be imported in a test** (Oxlint `.vue` issue) and is not auto-imported: its content lives in `components/ErrorPage.vue`.
- **happy-dom applies no CSS**: a label hidden with `display: none` keeps its text in a component test but loses its accessible name in a real browser. Check accessible names in the browser test.
- **Unit tests under `test/unit` need the server tsconfig** (`nitro.typescript.tsConfig.include`), otherwise the pre-commit type-check fails with TS2591 on `node:*`.
- **libSQL keeps the file locked on Windows after `close()`** until native statements are garbage-collected; a failed statement holds its own. Unit tests run with `--expose-gc`, call `gc()` and retry the removal (`removeWhenReleased`), and keep only the message of libSQL errors. Without it: EPERM on cleanup.
- **`@nuxt/test-utils/e2e` and duplicated vitest copies**: loaded outside the module runner, `setup()` imports another vitest copy ("Vitest failed to find the current suite"). The `web-e2e` project inlines it (`server.deps.inline`).
- **`setup()` already stops the server in its own `afterAll`**: calling `stopServer()` again throws "No context is available". Clean temporary folders in a file-level `afterAll`, which runs later.
- **Untyped `$fetch` from `@nuxt/test-utils`** hits TS2321 ("Excessive stack depth") on Nitro typed routes: give the return type, `$fetch<Settings>(...)`.
- **E2E tests are type-checked without the DOM lib**: `document` inside `page.evaluate` fails with TS2584. Use selectors (`page.waitForSelector('html.dark', { state: 'attached' })`, `locator.getAttribute()`).
- **The e2e build happens once, in `test/e2e/global-setup.ts`**, through a child Node process (`build-app.mts`): loaded inside Vitest's module runner, Nuxt's module resolution crashes in the runner's source-map support ("code.charCodeAt is not a function"). Every e2e file spreads `sharedBuild` from `test/e2e/build.ts` into `setup()` (`build: false`, shared output); a new file must do the same, or it builds again.
- **The e2e build prints esbuild "Big integer literals" warnings**: harmless.
- **`playwright-core install` must run from `apps/web`** through `vp exec`, where the package is installed.

## Server and database

- **Nitro 2 plugins are synchronous**: `runNitroPlugins` does not await them, and they run in the alphabetical order of `server/plugins/`. Read v2.nitro.build, not nitro.build (Nitro 3).
- **The Nitro 2 `request` hook is awaited but its errors are swallowed**: the database plugin logs the failure once and `useDatabase()` rethrows it to every caller.
- **drizzle-orm's migrator reads a folder on disk**, absent from `.output`: migrations are a Nitro server asset applied by our own runner. Never call drizzle's `migrate()` on the server.
- **orm.drizzle.team documents the 1.0 RC**; the installed 0.45 sometimes differs. Check the page version or the types in `node_modules`.
- **libSQL's native binary is missing from `.output`** without `nitro.externals.traceInclude` (computed `require`). Only the build platform's binary is installed: build where the server runs.
- **`NUXT_*` variables go through destr**: `NUXT_DATA_DIR=123` arrives as a number, and the Zod schema rejects it at startup. The `.env` file is read by the Nuxt CLI only, never by `node .output/server/index.mjs`.
- **Unknown routes go through the router** (`experimental.early404` off): plugins run twice on a 404, hence two `set-cookie luz-color-mode` headers (#23).
- **`curl` on an error route returns JSON** unless it sends `Accept: text/html`.
- **Never display an error's `statusText` or `message`**: a 404's `statusText` contains the path, and other messages can come from the server.

## UI

- **`UError` is built for a standalone page** (`main` root, `h1`, full-screen height). Inside the layout, pass `:as="{ root: 'div', statusMessage: 'h2' }"` and `class="h-full min-h-0"`.
- **`not-sr-only` resets `position`, `padding` and `margin`**: combined with `focus:fixed` or `focus:p-*` under the same variant, the result depends on Tailwind's generation order. Check the computed style.
- **Before hydration, clicks and typing are lost** in a browser check (the sidebar footer "Theme: …" only appears once hydrated). Nuxt UI menus close between coordinate-based actions: target elements by reference or keyboard.

## Agent environment (Windows)

- **Run servers as background tasks** (`vp run dev`, or `node .output/server/index.mjs` with `NUXT_DATA_DIR` on a temporary folder and `PORT`) and stop the task; killing processes by port is refused. Never point a test server at `apps/web/.luz` or `%APPDATA%\Luz`.
- **The user's dev server may be running** and refreshing `.nuxt` during installs: leave it alone.
- **`.env*` files are blocked** for agents, `.env.example` included: ask the user to edit them.
- **Leftover temporary folders** (`%LOCALAPPDATA%\Temp\luz-*`) cannot be deleted by the agent: list them for the user.
- **A `cd` in a Bash command changes the working directory of the following ones**: use absolute paths.
- **Long heredocs with apostrophes can break in Windows Bash** ("unexpected EOF"): write the script to a file first.
- **`gh run list -b <branch> -L 1` can return the "Dependabot auto-merge" run**: filter with `-w CI`. Right after `gh pr create`, `gh pr checks --watch` reports "no checks" while runs are queued; use `gh run watch <id> --exit-status`.
- **A milestone can gain issues after its last merge**: recheck open issues at the moment you verify it.
