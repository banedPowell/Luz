# 0007. Downloads run as persisted jobs, one at a time

- Status: Accepted
- Date: 2026-11-05

## Context

Downloads (v0.3) are the first long-running work in Luz. A job runs external processes (yt-dlp, then FFmpeg) for minutes, reports progress to the browser, can be cancelled, and ends with files moved into the user's music library. Several issues depend on the same choices: the queue (#83), format and conversion (#84), the move into the library (#85), the page and the on-screen queue (#55, #86). They are written down once, before code.

Luz runs for one person on their own computer, inside one Nuxt server ([ADR 0003](0003-twelve-factor-config.md)), on SQLite ([ADR 0002](0002-sqlite-drizzle-libsql.md)). The choices below favour what survives a restart, never touches the library by surprise, and stays testable with fakes.

## Decision

### Persistence

- Jobs and their items are rows in SQLite: `download_jobs` (one per request: URL, state, timestamps, item counts) and `download_items` (one per track: source id, title, target path, state, progress, error, log). State, timestamps and counts are real columns, since the queue and its history are queried by them; only opaque payloads (the yt-dlp analysis) may be JSON.
- The queue and its history survive a restart. A job or item still `running` when the server stopped comes back at the next startup as `failed` with the reason "interrupted"; it is never resumed silently. The user starts it again if they want to.

Ruled out: an in-memory queue (loses history and in-flight jobs on every restart); a JSON file per job (no queries, a second source of truth beside the database).

### Execution

- One in-process queue, started by a Nitro plugin, runs one job at a time and, inside a job, one item at a time. Queued jobs wait their turn in creation order.
- The queue only reaches the tools through their adapters in `server/infrastructure/`, which spawn processes through the process runner of #16. The heavy work happens in those child processes, so the Node event loop stays free.

Ruled out: worker threads (the work is already in child processes, they would add messaging and nothing else); an external queue such as BullMQ or Redis (a second service to install for one user, against the "one folder, one process" setup); parallel downloads (more load on the source and more rate limiting for a small gain; can be a setting later, as a new decision).

### Progress to the browser

- `GET /api/downloads/events` streams job and item updates as server-sent events through h3's `createEventStream`, one endpoint for the whole queue.
- Events are hints, not the source of truth. The client loads the list from `GET /api/downloads` when it opens the stream and again on every reconnection, so a missed event never leaves the screen wrong.
- Progress updates are throttled per item (a few per second at most) before they reach the database and the stream.

Ruled out: polling (needless requests while nothing moves, and late updates while something does); WebSockets (two-way traffic that downloads do not need, and a separate upgrade path in Nitro; SSE goes through plain HTTP and reconnects by itself).

### Cancellation

- Cancelling a queued job removes it from the queue. Cancelling a running job aborts the `AbortSignal` handed to the process runner, which kills the running process, then removes the job's temporary folder and marks the job and its unfinished items `cancelled`.
- Items of a cancelled job that already reached the library stay there: cancelling never deletes music.

### Files

- Everything a job writes goes to its own folder in the data directory, `<dataDir>/downloads/<jobId>/`, never into the music library directly.
- A file is moved into the library only once it is complete, converted and tagged (#85). The final path comes from the naming templates (#81).
- A name collision in the library never overwrites: the item fails with a clear message naming the existing file. This move is the only write to the music library in v0.3.
- The job folder is removed when the job ends, whatever its state; a folder left behind by a crash is removed at the next startup, together with the "interrupted" recovery.

Ruled out: downloading straight into the library (a cancelled or failed download would leave partial files among the user's music); a random suffix on collision (silent duplicates the user did not ask for; duplicate handling belongs to v0.4).

### Logs

- Each item keeps the technical output of its processes (stdout and stderr, as lines), capped in size: when it grows past the cap, the oldest lines are dropped and the log says so.
- The interface shows the plain-language step and error first, and the log behind "Show details".
- The server logger (consola, stdout) records job starts, ends and failures, not the full tool output.

## Consequences

- The queue, its history and the reason of every failure survive a restart, and a restart never leaves a half-downloaded file in the library.
- One job at a time keeps the code and the tests simple, and a long playlist delays the next job: acceptable for one user, to be revisited with several users (v2).
- Every tool call goes through the process runner, so tests drive the queue with a fake runner emitting scripted lines; no real binary or network.
- The data directory needs room for one job's files at a time, before they move to the library.
- The database grows with the job history and capped logs; clearing old jobs is a later feature.
