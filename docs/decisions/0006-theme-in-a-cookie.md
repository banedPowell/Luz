# 0006. The theme is a browser preference, kept in a cookie

- Status: Accepted
- Date: 2026-11-04

## Context

Until v0.2 the theme was a setting like the music library path: a column of the `settings` table, read through `/api/settings`, and copied by the server into the colour-mode cookie at every page load so the page rendered in the right theme.

But the theme belongs to whoever looks at the screen, not to the library. A phone in the dark and a desktop in daylight want different themes, and with several users (v1.x) a single stored theme would be wrong for most of them. `@nuxtjs/color-mode` already keeps the choice in a cookie, and the server reads that cookie before the first paint, so storing it a second time gained nothing.

## Decision

- The theme lives only in the `luz-color-mode` cookie, written by `@nuxtjs/color-mode` (one year, path `/`). The server never stores it.
- The sidebar switch and the Settings page change it in the browser at once, with no request.
- The `settings` table keeps what describes the library and the server, such as the music library path.

## Consequences

- No flash and no request when the theme changes; it works even while the database cannot be read.
- Each browser has its own theme: a new browser, or cleared cookies, start from "System".
- When accounts arrive (v1.x), a per-user theme, if wanted, is a new decision; it would not go back into the shared settings.
