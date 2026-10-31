# 0004. The prototype is a reference, not a base

- Status: Accepted
- Date: 2026-10-31

## Context

A first version of Luz was built quickly to explore the product: download queue with live progress, library, playlists, metadata editing, scan, duplicate cache and diagnostics. It works, but has no tests, no lint or formatting, and a storage model inherited from JSON files.

## Decision

- The prototype lives on the `prototype` branch and is never merged.
- The real application is rebuilt on `dev`, feature by feature, following the [roadmap](../ROADMAP.md).
- The prototype may be read for product ideas, UI flows and yt-dlp or FFmpeg usage. Code taken from it is rewritten to current standards and covered by tests.

## Consequences

- Every feature is built on the final architecture from the start.
- Rebuilding takes longer than refactoring, in exchange for a codebase without inherited shortcuts.
