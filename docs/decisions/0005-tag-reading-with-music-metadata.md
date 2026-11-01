# 0005. Tags are read with music-metadata

- Status: Accepted
- Date: 2026-11-01

## Context

The library scan (#32) reads the tags of every audio file in the music folder, possibly tens of thousands of them, and rescans them often. Luz must cover at least MP3, FLAC, M4A/AAC, Ogg Vorbis and Opus, never write to the files, and keep its tests free of real binaries. Candidates:

| Option                             | Formats                                   | Speed (5 small fixtures, Windows) | Maintenance, licence                    |
| ---------------------------------- | ----------------------------------------- | --------------------------------- | --------------------------------------- |
| `music-metadata`                   | All of the above, and WAV, AIFF, APE, ... | ~1.7 ms per file, in process      | Active (weekly releases), MIT, pure ESM |
| `ffprobe` through its adapter      | Everything FFmpeg decodes                 | ~40 ms per file, one process each | Active, LGPL/GPL binary installed apart |
| `node-taglib-sharp`, `jsmediatags` | Partial                                   | Not measured                      | LGPL port of taglib-sharp; unmaintained |

`ffprobe` returns raw tag keys that differ per container (`TPE2`, `album_artist`, `ALBUMARTIST`, `aART`), which Luz would have to map itself, and its tests would call the real binary, which [CLAUDE.md](../../CLAUDE.md) forbids.

## Decision

- Tags are read with `music-metadata`, which reads only the headers and tag blocks and maps every container to one set of common tags.
- It is reached only through the `TagReader` interface of `server/infrastructure/tag-reader.ts`, which returns the `TrackTags` of `@luz/core`, validated with Zod, or a typed error (`unsupported`, `unreadable`). Nothing else imports `music-metadata`.
- Cover art is skipped (`skipCovers`) until a feature needs it.

## Consequences

- No binary is needed to scan a library, and adapter tests run on small committed fixtures.
- Duration comes from the headers, without decoding: it is estimated for a VBR MP3 that has no Xing or VBRI header.
- `music-metadata` is lenient: a file that starts with a valid signature followed by garbage can come back with empty tags instead of an error, and lands in the "unknown" album.
- Changing library later means rewriting one adapter; the rest of the server sees only `TagReader`.
