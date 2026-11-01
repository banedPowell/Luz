# Audio fixtures

Half a second of silence, tagged, one file per supported format, for the tag reader tests. Generated once with FFmpeg; no recorded music. Regenerate from this folder with Bash:

```bash
tags=(-metadata title="Fixture Tone" -metadata artist="Luz Test Artist" -metadata album="Luz Fixtures" -metadata album_artist="Luz Test Band" -metadata track="3/12" -metadata disc="1/2" -metadata date="2024" -metadata genre="Test")
src=(-y -f lavfi -i anullsrc=r=8000:cl=mono -t 0.5 -map_metadata -1)
ffmpeg "${src[@]}" -c:a libmp3lame -b:a 8k "${tags[@]}" tone.mp3
ffmpeg "${src[@]}" -c:a flac "${tags[@]}" tone.flac
ffmpeg "${src[@]}" -c:a aac -b:a 8k "${tags[@]}" tone.m4a
ffmpeg "${src[@]}" -c:a libvorbis -q:a 0 "${tags[@]}" tone.ogg
ffmpeg -y -f lavfi -i anullsrc=r=48000:cl=mono -t 0.5 -map_metadata -1 -c:a libopus -b:a 6k "${tags[@]}" tone.opus
head -c 300 tone.m4a > corrupt.m4a
printf 'not audio, just text\n' > not-audio.txt
```

`corrupt.m4a` is a truncated M4A: its first atom claims more bytes than the file holds. A truncated FLAC or Ogg would not do, because the parser returns empty tags for them instead of an error (ADR 0005).
