# yt-dlp fixtures

Hand-written outputs of `yt-dlp --dump-single-json --flat-playlist --no-warnings`, shaped like what yt-dlp prints for YouTube, reduced to a few fields plus some Luz ignores. The tests feed them to a fake process runner: no real yt-dlp, no network.

- `track.json`: one video with the music fields YouTube Music gives (`track`, `artists`, `album`, `release_year`).
- `playlist.json`: a flat playlist of three entries, without music fields, one with `null` fields.
- `private-video.stderr.txt`: what yt-dlp prints on stderr, exit code 1, for a private video.
