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
- **`mountSuspended` never unmounts by itself**: a mounted page keeps following the shared router, so every later test renders it again and a file slows down test after test until one times out in CI (`library-views.test.ts` went from 0.4 s to 5 s per test). The `web` test project calls `enableAutoUnmount(afterEach)` once for every file, in its setup file `apps/web/test/nuxt/setup.ts`; do not repeat it in a test file, and never rely on a component mounted by a previous test.
- **A Nuxt UI toast is announced inside `UApp` for about a second**: Reka renders a visually hidden "Notification …" live region in place, next to the toaster, while the toast itself goes to `body`. `wrapper.text()` on a component wrapped in `UApp` may then contain the toast's text; check the page component itself (`findComponent`) when a test asserts the toast left the page as it was.
- **Nuxt UI shortcuts (`defineShortcuts`) listen on `window` and check `document.activeElement`**: dispatch the `keydown` on `window`, and mount with `attachTo: document.body` when a test needs a field to hold the focus.
- **`error.vue` cannot be imported in a test** (Oxlint `.vue` issue) and is not auto-imported: its content lives in `components/ErrorPage.vue`.
- **happy-dom applies no CSS**: a label hidden with `display: none` keeps its text in a component test but loses its accessible name in a real browser. Check accessible names in the browser test.
- **Unit tests under `test/unit` need the server tsconfig** (`nitro.typescript.tsConfig.include`), otherwise the pre-commit type-check fails with TS2591 on `node:*`.
- **libSQL keeps the file locked on Windows after `close()`** until native statements are garbage-collected; a failed statement holds its own. Unit tests run with `--expose-gc`, call `gc()` and retry the removal (`removeWhenReleased`), and keep only the message of libSQL errors. Without it: EPERM on cleanup.
- **`@nuxt/test-utils/e2e` and duplicated vitest copies**: loaded outside the module runner, `setup()` imports another vitest copy ("Vitest failed to find the current suite"). The `web-e2e` project inlines it (`server.deps.inline`).
- **`setup()` already stops the server in its own `afterAll`**: calling `stopServer()` again throws "No context is available". Clean temporary folders in a file-level `afterAll`, which runs later.
- **Untyped `$fetch` from `@nuxt/test-utils`** hits TS2321 ("Excessive stack depth") on Nitro typed routes: give the return type, `$fetch<Settings>(...)`.
- **E2E tests are type-checked without the DOM lib**: `document` inside `page.evaluate` fails with TS2584. Use selectors (`page.waitForSelector('html.dark', { state: 'attached' })`, `locator.getAttribute()`).
- **The e2e build happens once, in `test/e2e/global-setup.ts`**, through a child Node process (`build-app.mts`): loaded inside Vitest's module runner, Nuxt's module resolution crashes in the runner's source-map support ("code.charCodeAt is not a function"). Every e2e file spreads `sharedBuild` from `test/e2e/build.ts` into `setup()` (`build: false`, shared output); a new file must do the same, or it builds again.
- **`page.waitForURL()` resolves before the client-side view renders**: the previous view is still on screen, so a locator can match its elements (strict-mode violation, or a count of 0). After a navigation, wait for something only the new view shows (`getByText('1 album').waitFor()`, its heading).
- **Every e2e server checks yt-dlp, FFmpeg and ffprobe at startup** (`server/plugins/tools.ts`): a new e2e file must spread `missingTools` from `test/e2e/build.ts` into its `env`, or its server runs the real tools installed on the machine.
- **The e2e build prints esbuild "Big integer literals" warnings**: harmless.
- **`playwright-core install` must run from `apps/web`** through `vp exec`, where the package is installed.

## Server and database

- **Nitro 2 plugins are synchronous**: `runNitroPlugins` does not await them, and they run in the alphabetical order of `server/plugins/`. Read v2.nitro.build, not nitro.build (Nitro 3).
- **The Nitro 2 `request` hook is awaited but its errors are swallowed**: the database plugin logs the failure once and `useDatabase()` rethrows it to every caller.
- **drizzle-orm's migrator reads a folder on disk**, absent from `.output`: migrations are a Nitro server asset applied by our own runner. Never call drizzle's `migrate()` on the server.
- **Never regenerate a migration a database may have applied**, even unmerged: a branch's dev database applies it at startup. The runner applies every migration newer than the last applied date, so the rewritten one runs again and the server fails to start (`duplicate column`). Add a new migration; `database.test.ts` pins every migration by date and hash.
- **Pin a migration in the PR that generates it**: `keeps the migrations already applied unchanged` lists exactly the migrations of the folder, so a new one fails it until its tag, `when` (from `meta/_journal.json`) and SHA-256 of its `.sql` file are added. The failing diff prints the values to copy (#66).
- **orm.drizzle.team documents the 1.0 RC**; the installed 0.45 sometimes differs. Check the page version or the types in `node_modules`.
- **libSQL's native binary is missing from `.output`** without `nitro.externals.traceInclude` (computed `require`). Only the build platform's binary is installed: build where the server runs.
- **`NUXT_*` variables go through destr**: `NUXT_DATA_DIR=123` arrives as a number, and the Zod schema rejects it at startup. The `.env` file is read by the Nuxt CLI only, never by `node .output/server/index.mjs`.
- **yt-dlp prints `NA` for a progress field it does not know** (`--progress-template`): `total_bytes` is `NA` on fragmented streams, where `total_bytes_estimate` holds the size, and the speed is `NA` at the start. `parseProgressLine` in core reads our own `luz-progress|...` template and ignores every other line, which stay in the item log; the progress lines themselves never enter it.
- **Unknown routes go through the router** (`experimental.early404` off): plugins run twice on a 404 (#23): a plugin with a side effect, such as setting a cookie, repeats it.
- **Albums and artists come from tags, not folders**: a track goes to its album artist, else its first track artist, and untagged values to an "unknown" entry. An album has no folder of its own (`AlbumDetail.folders` lists its tracks' folders), and renaming it in the tags gives it a new id: a page holding the old id must cope with a 404.
- **The codec decides losslessness, never the extension**: ALAC and AAC both use `.m4a` (`codecName()` in core). A track with `lossless` null was indexed before the column existed and is read again by the next scan, even if unchanged.
- **A scoped scan (album or track ids) adds nothing**: it only compares the tracks already indexed in its scope, file by file (`statFile`), and removes those whose file is gone or left the library folder. New files appear through a library scan only.
- **Every searchable name needs its `search_*` column**, holding `searchKey()` from core, written with the name and backfilled at startup; search matches it with `LIKE`, so a name written without it is never found.
- **`curl` on an error route returns JSON** unless it sends `Accept: text/html`.
- **Never display an error's `statusText` or `message`**: a 404's `statusText` contains the path, and other messages can come from the server.

## UI

- **`UError` is built for a standalone page** (`main` root, `h1`, full-screen height). Inside the layout, pass `:as="{ root: 'div', statusMessage: 'h2' }"` and `class="h-full min-h-0"`.
- **`not-sr-only` resets `position`, `padding` and `margin`**: combined with `focus:fixed` or `focus:p-*` under the same variant, the result depends on Tailwind's generation order. Check the computed style.
- **Before hydration, clicks and typing are lost** in a browser check (the theme buttons of the sidebar footer only appear once hydrated). Nuxt UI menus close between coordinate-based actions: target elements by reference or keyboard.
- **`UTable` only sorts a column that has an accessor**: with an `id` alone, `enableSorting` does nothing and the header gets no `aria-sort`. Server-sorted lists give it `accessorFn: () => null` and `manualSorting` (`useSortableHeaders`).
- **`resolveComponent()` outside a template** (in a column `header` render function) finds no Nuxt component, which are not registered globally: it renders an empty unknown element. Import from `#components` instead.
- **The theme is not a setting** ([ADR 0006](../decisions/0006-theme-in-a-cookie.md)): it lives in the `luz-color-mode` cookie, changed with no request. In the built-in browser, that cookie forces the theme; change it to check the other one, then restore it.
- **`sticky` does nothing inside the app shell**: the window scrolls, not `main`, and the shell's wrapper is `overflow-hidden`, which captures sticky elements. Something that must stay on screen (the selection bar) is `fixed`, with room kept at the end of the list.

## Agent environment (Windows)

- **Run servers as background tasks** (`vp run dev`, or `node .output/server/index.mjs` with `NUXT_DATA_DIR` on a temporary folder and `PORT`) and stop the task; killing processes by port is refused. Never point a test server at `apps/web/.luz` or `%APPDATA%\Luz`.
- **The user's dev server may be running** and refreshing `.nuxt` during installs: leave it alone.
- **`.env*` files are blocked** for agents, `.env.example` included: ask the user to edit them.
- **Leftover temporary folders** (`%LOCALAPPDATA%\Temp\luz-*`) cannot be deleted by the agent: list them for the user.
- **A `cd` in a Bash command changes the working directory of the following ones**: use absolute paths.
- **Long heredocs with apostrophes can break in Windows Bash** ("unexpected EOF"): write the script to a file first.
- **`gh run list -b <branch> -L 1` can return the "Dependabot auto-merge" run**: filter with `-w CI`. Right after `gh pr create`, `gh pr checks --watch` reports "no checks" while runs are queued; use `gh run watch <id> --exit-status`.
- **A milestone can gain issues after its last merge**: recheck open issues at the moment you verify it.
