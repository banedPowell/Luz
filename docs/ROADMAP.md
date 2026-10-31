# Roadmap

This document is the source of truth for **what Luz is meant to become and in which order**. Issues describe the work; this file describes the intent behind it.

- Each milestone below matches a GitHub milestone of the same name.
- Issues are created when a milestone starts, not before: see [Planning a milestone](../CONTRIBUTING.md#planning-a-milestone).
- When the plan changes, this file changes in the same PR, so the history keeps track of why.
- Architecture choices are recorded in [decisions](decisions/).

## Vision

Luz is a music library manager that keeps music as plain, well-tagged audio files on disk. It is first a **file manager**: it downloads, tags, organises and exports. Playing music is a convenience, never the core.

It starts as a web app for one person on their own computer, then becomes a self-hosted server that anyone can install, with optional authentication and several users. A mobile app may follow in the very long term, built on the same API and domain package.

## Toward v1.0: the local app

### v0.1 Foundation

**Goal:** a solid, empty application that every later feature can build on.

- Monorepo (`apps/web`, `packages/core`) driven by Vite+ and pnpm.
- Formatting, linting, type checking, tests and Git hooks, all green in CI.
- Nuxt 4 and Nuxt UI app shell: sidebar layout, light and dark themes.
- SQLite database with Drizzle, a relational schema and versioned migrations.
- Configuration from environment variables and a configurable data directory.
- Settings persisted and editable from a settings page.

**Out of scope:** any music feature.
**Done when:** `vp check`, tests and build pass in CI, the app starts on an empty data directory and settings survive a restart.

### v0.2 Library

**Goal:** Luz understands an existing music folder.

- Scan a library folder and read tags from audio files.
- Tracks, albums and artists built from those tags, stored in the database.
- Browse, search and sort tracks, albums and artists.
- Rescan detects added, changed and removed files.

**Out of scope:** editing tags, downloading.
**Done when:** pointing Luz at a real music folder gives a faithful, browsable library.

### v0.3 Downloads

**Goal:** add music to the library from a URL.

- Analyse a URL (track or playlist) with yt-dlp and preview what will be downloaded.
- Download queue with live progress, cancellation and per-job logs.
- Choose format and quality; FFmpeg handles conversion and artwork embedding.
- Naming templates for files and folders, applied to every download.
- Downloaded files land in the library like scanned ones.

**Out of scope:** sources other than those yt-dlp supports out of the box, metadata providers.
**Done when:** a YouTube playlist URL ends up as a correctly named, tagged album in the library.

### v0.4 Metadata

**Goal:** a clean library.

- Edit metadata of one or many tracks, albums and artists; changes are written to the files.
- Artwork: view, replace, embed.
- Featured artists handling rules (title, metadata or both).
- Duplicate detection before and after download.
- Repair: resynchronise the database with what is on disk.

**Done when:** every visible metadata field can be fixed from the UI and the files reflect it.

### v0.5 Playlists

**Goal:** curate and export.

- Create, rename, reorder (drag and drop), duplicate and merge playlists.
- Export playlists as M3U.

**Done when:** a playlist built in Luz plays in another player from its exported file.

### v1.0 Local release

**Goal:** a stable app worth using daily on one computer.

- Polish, accessibility, error handling and empty states across the app.
- Data export and import (backup).
- Documentation for installing and running Luz locally.

**Done when:** the author uses Luz as their only tool to manage their music.

## After v1.0

These are directions, not commitments. Each becomes a milestone, with goal, scope and done criteria, when it is planned.

### Device profiles

User-named profiles (phone, portable player, car, computer…) that each define format, quality, naming template, folder layout and artwork size. Export or synchronise a selection of the library to a device, converting with FFmpeg when needed.

### Metadata providers

Fetch metadata and artwork from external providers with a configurable priority order (MusicBrainz first is the likely default), falling back to the next one when a match fails, and always allowing a manual match or manual edit.

### Configurable sources

Enable, disable and order download sources from the settings, beyond the defaults.

### Audio player

A simple built-in player, as long as it stays cheap to build and maintain. Luz remains a file manager first.

### Self-hosting (v2)

- Official Docker image published on each release.
- Optional authentication, several users, remote access.

### Mobile app (very long term)

A mobile client consuming the Luz API, reusing `packages/core`.
