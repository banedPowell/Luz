# Luz

Luz is a local-first music library manager. It downloads music from online sources, tags it properly and keeps it organised as plain audio files on your own disk.

> **Status:** early development. Nothing is usable yet. See the [roadmap](docs/ROADMAP.md).

## Why

Music you own should live in files you control, with clean metadata, sensible folder names and playlists that follow you from one device to another. Luz aims to make that effortless:

- **Download** tracks, albums and playlists from configurable sources, powered by [yt-dlp](https://github.com/yt-dlp/yt-dlp) and [FFmpeg](https://ffmpeg.org/).
- **Organise** a library of tracks, albums and artists, built from the files themselves.
- **Tag** files with accurate metadata and artwork, fetched from the most relevant provider, with a manual fallback when automation gets it wrong.
- **Curate** playlists and export them.
- **Take it with you** through device profiles (phone, portable player, computer) that each define their own format, quality and naming.

Luz starts as a web app running on your own computer. Self-hosting with Docker, optional authentication and multiple users come later.

## Contributing

The workflow is described in [CONTRIBUTING.md](CONTRIBUTING.md).

## Licence

[PolyForm Noncommercial 1.0.0](LICENSE.md): free to use, modify and share for any noncommercial purpose. Commercial use requires prior agreement.
