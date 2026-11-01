# Architecture decisions

Short records of the choices that shape Luz, and why they were made. Read them before changing what they cover.

A new decision gets the next number. A decision is never rewritten: when it no longer holds, a new record supersedes it and the old one's status says so.

| #                                               | Decision                                          | Status   |
| ----------------------------------------------- | ------------------------------------------------- | -------- |
| [0001](0001-monorepo-with-vite-plus.md)         | pnpm monorepo driven by Vite+                     | Accepted |
| [0002](0002-sqlite-drizzle-libsql.md)           | SQLite with Drizzle and libSQL, relational schema | Accepted |
| [0003](0003-twelve-factor-config.md)            | Configuration and data follow twelve-factor rules | Accepted |
| [0004](0004-prototype-as-reference.md)          | The prototype is a reference, not a base          | Accepted |
| [0005](0005-tag-reading-with-music-metadata.md) | Tags are read with music-metadata                 | Accepted |

## Template

```md
# NNNN. Title

- Status: Proposed | Accepted | Superseded by NNNN
- Date: YYYY-MM-DD

## Context

What forces the decision.

## Decision

What we do.

## Consequences

What it makes easier, what it makes harder.
```
