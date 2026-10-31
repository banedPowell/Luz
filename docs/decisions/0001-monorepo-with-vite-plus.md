# 0001. pnpm monorepo driven by Vite+

- Status: Accepted
- Date: 2026-10-31

## Context

Luz starts as a single Nuxt web app, but is expected to grow a Docker image, possibly background workers and, much later, a mobile client. Domain logic (metadata rules, naming templates, track numbering) must be reusable outside Nuxt and easy to test in isolation.

Vite+ 1.0 (MIT, September 2026) unifies Vite, Vitest, Oxlint, Oxfmt, tsdown, a cached task runner and Git hooks behind the `vp` CLI. Its Nuxt support is partial:

- `vp dev`, `vp build` and `vp preview` run plain Vite, not Nuxt.
- Oxlint lints the `<script>` of `.vue` files but not their templates.
- Nuxt tests need a `vitest.config.ts` built with `@nuxt/test-utils`, where Vite+ prefers the `test` block of `vite.config.ts`.

## Decision

- A pnpm workspace with `apps/web` (Nuxt 4, Nuxt UI, Nitro server) and `packages/core` (pure TypeScript domain). New packages are added only when a concrete need appears.
- `vp` is the entry point for every command. It delegates installs to pnpm, which stays the package manager underneath.
- Vite+ handles formatting (Oxfmt), linting (Oxlint), tests (Vitest), tasks (`vp run`) and Git hooks (`vp staged`, `vp hooks`).
- Nuxt commands run through `vp run <script>` (`nuxt dev`, `nuxt build`, `nuxt typecheck`).
- Vue template linting is accepted as a gap for now; `vue-tsc` type checking covers template type errors. ESLint is not added alongside Oxlint.
- `apps/web` keeps its own `vitest.config.ts` based on `@nuxt/test-utils`.

## Consequences

- One fast toolchain and one way to run things, locally and in CI.
- Template-level lint rules (accessibility, Vue conventions) are not enforced automatically; reviews must watch for them. Revisit when Oxlint gains Vue template support or Vite+ ships a Nuxt integration.
- `packages/core` stays free of Vue, Nuxt and I/O, which keeps it portable and quick to test.
