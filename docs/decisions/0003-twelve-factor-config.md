# 0003. Configuration and data follow twelve-factor rules

- Status: Accepted
- Date: 2026-10-31

## Context

Luz runs on a personal computer today and must later run unchanged in a Docker container on a server. The [twelve-factor app](https://12factor.net/) principles describe how to build apps that behave the same in every environment.

## Decision

- **Configuration comes from environment variables**, read through Nuxt `runtimeConfig`. Every variable is documented in `.env.example` with a sensible default.
- **No hard-coded paths.** Luz data (database, cookies, artwork cache) lives in one data directory set by an environment variable, with a per-OS default. The music library path is a setting.
- **External tools are configured, not assumed.** Paths to yt-dlp and FFmpeg come from configuration, and their presence is checked at startup and shown in the UI.
- **Logs go to standard output**, structured, never only to files.
- **The server process holds no state that cannot be rebuilt** from the database and the files on disk.

## Consequences

- A Docker image is a thin wrapper: install the tools, set the variables, mount the data and music volumes.
- Tests can run against a temporary data directory with no global side effects.
