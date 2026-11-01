# Luz: guide for agents

This file tells any agent working in this repository what the project is, how it is built and what is off limits. Read it fully before doing anything, then read the documents it points to when your task touches them.

## The project

Luz is a local-first music library manager: it downloads music with yt-dlp and FFmpeg, tags it, and keeps it organised as plain audio files on the user's disk. It is a **file manager first**; playback is a convenience.

- **Today:** a web app for one person on their own computer (milestones v0.x → v1.0).
- **Later:** device profiles, metadata providers, configurable sources, then a self-hosted Docker server with optional authentication and several users. A mobile app in the very long term.
- **Status:** v0.2 Library in progress. `packages/core` defines the track tags and the rules that group tracks into albums and artists (album artist, else first track artist; untagged values go to an "unknown" entry); the database has `artists`, `albums` and `tracks` tables, written through the library repository, which drops empty albums and artists. A tag reader adapter reads the tags of an audio file with `music-metadata` ([ADR 0005](docs/decisions/0005-tag-reading-with-music-metadata.md)), read-only, behind the `TagReader` interface. `POST /api/library/scan` (service `library-scan`) walks the configured music folder through the file system adapter (symbolic links and hidden entries skipped), keeps audio extensions (`isAudioFile` in core), clears and rebuilds the library and returns a summary, one scan at a time; the Library page has the scan button. Read endpoints under `/api/library/` (service `library-browse`) list tracks, albums and artists, paginated and sorted by the database (sort keys and page validated by the list query schemas in core), and return an album or an artist with its tracks by disc then track number; the Library section has Tracks, Albums and Artists views and detail pages, sortable from their column headers, with the sort and page in the URL query and an empty state pointing to the scan. From v0.1 Foundation: the monorepo and its tooling are in place; `apps/web` has the app shell (Nuxt UI sidebar layout, themes, placeholder pages) and `packages/core` holds the settings and server config schemas (Zod), consumed from its TypeScript sources (no build step). The server reads its configuration from `NUXT_*` variables, creates the data directory at startup and opens the SQLite database there (`luz.db`), applying pending migrations and writing the default settings before it serves any request. The settings (theme, music library path) are read and edited through `GET`/`PATCH /api/settings` and the Settings page; the server sets the colour-mode cookie from the stored theme, so the page renders in the right theme without a flash. A browser end-to-end test (Playwright's headless Chromium through `@nuxt/test-utils/e2e`) checks the shell's sidebar, narrow-screen menu and theme switch. Keep the [Commands](#commands) and [Layout](#layout) sections in sync with reality.

Read before working:

- [docs/ROADMAP.md](docs/ROADMAP.md): milestones, scope and what is explicitly out of scope.
- [docs/decisions/](docs/decisions/): architecture decisions. Do not contradict one without proposing a new record.
- [CONTRIBUTING.md](CONTRIBUTING.md): issues, branches, PRs, releases, board.
- [docs/agents/pitfalls.md](docs/agents/pitfalls.md): traps already met, by topic. Read only the sections your task touches, and add one when you lose time on something the next agent would hit too.

The `prototype` branch holds a throwaway first version ([ADR 0004](docs/decisions/0004-prototype-as-reference.md)). Read it for ideas; never merge it, never copy code from it without rewriting it to current standards and testing it.

## Stack

- **Monorepo:** pnpm workspace driven by **Vite+** (`vp`). pnpm stays the package manager underneath.
- **Web app:** Nuxt 4, Nuxt UI 4, Tailwind CSS 4, Vue 3 (`<script setup lang="ts">`), Pinia only for cross-page client state.
- **Server:** Nitro (inside Nuxt), Zod for every input.
- **Database:** SQLite through Drizzle ORM and `@libsql/client`, relational schema, drizzle-kit migrations.
- **External tools:** yt-dlp, FFmpeg and ffprobe, behind adapters.
- **Tests:** Vitest; `@nuxt/test-utils` for the web app.
- **Node:** version in `.nvmrc`.

## Layout

Target layout (create packages and folders only when needed):

```
apps/web/                 Nuxt app: UI (app/) and API (server/)
  app/                    pages, layouts, components, composables, stores, utils
  app/app.config.ts       Nuxt UI theme: neutral colour, pixelarticons icons, subtle inputs
  test/nuxt/              component tests in the Nuxt environment (@nuxt/test-utils)
  app/plugins/            Nuxt plugins (e.g. loading the settings during server rendering)
  test/unit/              plain Node tests for server code (root `web-unit` test project)
  test/fixtures/audio/    tagged audio fixtures of a few KB, one per supported format (README has the FFmpeg commands)
  test/e2e/               builds the app once (global setup), then each file runs its own server on a temporary data directory (root `web-e2e` project), in Chromium for the shell
  vitest.config.ts        the web test project, listed in the root test.projects
  drizzle.config.ts       drizzle-kit config: schema, migrations folder, database in the data directory
  .env.example            every NUXT_* variable with its default
  server/api/             thin route handlers
  server/plugins/         Nitro startup plugins (e.g. creating the data directory)
  server/services/        application services (use cases)
  server/infrastructure/  config, data directory, db, tag reader, yt-dlp, ffmpeg, filesystem adapters
    database/             Drizzle schema, libSQL client, migration runner, drizzle-kit migrations
  server/utils/           auto-imported helpers: useLuzConfig(), useDatabase(), logger (consola, stdout)
packages/core/            pure TypeScript domain: types, Zod schemas, rules
scripts/                  repository tooling run by Node (e.g. the commit-msg check)
docs/                     roadmap, architecture decisions and agent pitfalls (agents/pitfalls.md)
.vite-hooks/              Git hooks: pre-commit runs `vp staged`, commit-msg checks Conventional Commits
vite.config.ts            shared Vite+ config: fmt (Oxfmt), lint (Oxlint), staged files, test projects
pnpm-workspace.yaml       workspace packages, allowed build scripts, the vite/vitest catalog and overrides
```

Lint and format settings live only in the root `vite.config.ts`; packages never add their own `fmt` or `lint` blocks.

## Commands

All commands go through `vp`. Nuxt commands run as scripts through `vp run`, because `vp dev` and `vp build` run plain Vite, not Nuxt. `vp` picks Node from `.nvmrc` and pnpm from `packageManager`.

| Command                                                 | Purpose                                                                         |
| ------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `vp install`                                            | Install dependencies (delegates to pnpm) and the Git hooks (`vp config`)        |
| `vp run dev`                                            | Start the Nuxt dev server (`apps/web`)                                          |
| `vp check`                                              | Format check, lint and types; `vp check --fix` formats and fixes                |
| `vp run typecheck`                                      | Type check every package (`nuxt typecheck`, i.e. `vue-tsc`, for the app)        |
| `vp run test`                                           | All tests (Vitest projects declared in `vite.config.ts`)                        |
| `vp exec playwright-core install --only-shell chromium` | Install the browser of the e2e tests, once, from `apps/web`                     |
| `vp run build`                                          | Production build of every package                                               |
| `vp run db:generate --name <name>`                      | Generate a migration from the Drizzle schema (commit it with the schema change) |
| `vp run db:studio`                                      | Open Drizzle Studio on the database of the configured data directory            |

Before declaring work done, run what CI runs: `vp check`, `vp run typecheck`, `vp run test`, `vp run build`.

## Architecture rules

- `packages/core` contains no Vue, Nuxt, Nitro, database or file system code. It is pure, deterministic and fully unit-tested.
- Route handlers in `server/api/` stay thin: validate input with Zod, call a service, return the result. No business logic in handlers.
- Server code never imports from `app/`; client code never imports from `server/`. Shared types come from `packages/core`.
- yt-dlp, FFmpeg and the file system are reached only through adapters in `server/infrastructure/`. Tests use fakes; they never call the real binaries or the network.
- Configuration comes from environment variables via `runtimeConfig`, documented in `apps/web/.env.example`. Server code reads it through `useLuzConfig()`, which validates it and resolves the data directory. No hard-coded paths ([ADR 0003](docs/decisions/0003-twelve-factor-config.md)).
- The audio files are the source of truth for tags; the database is an index a rescan can rebuild.
- Every schema change ships with a generated migration in the same PR. Use real columns for anything queried; JSON columns only for opaque payloads.
- Operations that modify or delete the user's files are explicit, confirmed in the UI and covered by tests.

## Code style

- English everywhere: identifiers, comments, docs, commits, issues. (Talking with the user in French is fine.)
- Tabs, LF, formatting by Oxfmt: never format by hand against the tool.
- TypeScript strict. No `any`, no `@ts-ignore`; use `unknown` and narrow.
- Comments explain why, not what.
- UI: Nuxt UI components first, theme tokens rather than raw colours, works in light and dark mode and on narrow screens, accessible (labels, keyboard, focus).
- Small, focused modules. Name things after the domain (track, album, artist, playlist, download job, device profile).

## Workflow

1. Work from an issue. No issue, no work: ask the user to create one or propose one.
2. Branch from an up-to-date `dev`: `<type>/<issue>-<slug>` (e.g. `feat/12-download-queue`).
3. Commit in Conventional Commits, lowercase subject.
4. Open a PR against `dev` with `Closes #<issue>` and the template filled in; title in Conventional Commits.
5. Keep the PR to one subject and ideally under 400 changed lines. Anything else you notice becomes a new issue.
6. Update docs in the same PR when behaviour, commands or decisions change (README, this file, ROADMAP, ADR).

## Never

- Commit or push directly to `main` or `dev`, force push to them, or delete them.
- Merge a PR, create a tag or a release, or change repository settings and rulesets unless the user explicitly asks.
- Bypass checks: no `--no-verify`, no disabled lint rules or skipped tests to get green, no weakened CI.
- Merge or rebase the `prototype` branch into anything.
- Add a dependency without saying why in the PR; prefer what the stack already provides.
- Edit a migration that has already been merged.
- Commit secrets, `.env` files, cookies, databases, downloaded music or personal data.
- Run yt-dlp or FFmpeg against real URLs or the user's library in tests or CI.
- Delete or overwrite the user's music files outside an explicit, confirmed feature.
- Change the licence (PolyForm Noncommercial 1.0.0).
- Expand the scope beyond the issue, or start work from a later milestone without the user's agreement.

## Definition of done

- The issue's acceptance criteria are met.
- New behaviour is covered by tests; bugs come with a regression test.
- `vp check`, `vp run typecheck`, `vp run test` and `vp run build` pass.
- UI changes were checked in the browser, light and dark.
- Docs are up to date.
