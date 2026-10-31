# 0002. SQLite with Drizzle and libSQL, relational schema

- Status: Accepted
- Date: 2026-10-31

## Context

Luz stores a library index (tracks, albums, artists, playlists), download jobs and settings. It runs locally first, then self-hosted in Docker, possibly with several users. The prototype stored every entity as a JSON blob in a `data` column, a leftover of a JSON-file storage, which made queries, constraints and migrations awkward.

## Decision

- SQLite as the database, through Drizzle ORM and drizzle-kit migrations.
- `@libsql/client` as the driver: prebuilt binaries (no native compilation on Windows or in Docker), local file by default, and a path to a remote libSQL server if ever needed.
- A relational schema: real columns for anything queried, sorted or constrained, foreign keys between entities. JSON columns only for genuinely opaque data (raw provider payloads, for instance).
- Migrations are generated from the schema, committed, and never edited once merged.

## Consequences

- Constraints and indexes live in the database; queries stay simple and fast.
- Schema changes always come with a migration, reviewed in the same PR.
- The audio files remain the source of truth for tags; the database is an index that a rescan can rebuild.
