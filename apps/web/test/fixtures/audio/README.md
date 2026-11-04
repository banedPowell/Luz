# Audio fixtures

Half a second of silence, tagged, one file per supported format, for the tag reader tests. Generated once with FFmpeg; no recorded music. Regenerate from this folder with Bash:

```bash
tags=(-metadata title="Fixture Tone" -metadata artist="Luz Test Artist" -metadata album="Luz Fixtures" -metadata album_artist="Luz Test Band" -metadata track="3/12" -metadata disc="1/2" -metadata date="2024" -metadata genre="Test")
src=(-y -f lavfi -i anullsrc=r=8000:cl=mono -t 0.5 -map_metadata -1)
ffmpeg "${src[@]}" -c:a libmp3lame -b:a 8k "${tags[@]}" tone.mp3
ffmpeg "${src[@]}" -c:a flac "${tags[@]}" tone.flac
ffmpeg "${src[@]}" -c:a aac -b:a 8k "${tags[@]}" tone.m4a
ffmpeg "${src[@]}" -c:a alac "${tags[@]}" tone-alac.m4a
ffmpeg "${src[@]}" -c:a pcm_s16le "${tags[@]}" tone.wav
ffmpeg "${src[@]}" -c:a pcm_s16be -write_id3v2 1 "${tags[@]}" tone.aiff
ffmpeg "${src[@]}" -c:a libvorbis -q:a 0 "${tags[@]}" tone.ogg
ffmpeg -y -f lavfi -i anullsrc=r=48000:cl=mono -t 0.5 -map_metadata -1 -c:a libopus -b:a 6k "${tags[@]}" tone.opus
head -c 300 tone.m4a > corrupt.m4a
printf 'not audio, just text\n' > not-audio.txt
```

`tone-alac.m4a` (lossless ALAC) and `tone.m4a` (lossy AAC) share an extension, so the tests check that the codec, not the extension, tells them apart. `tone.wav` and `tone.aiff` are uncompressed PCM.

`corrupt.m4a` is a truncated M4A: its first atom claims more bytes than the file holds. A truncated FLAC or Ogg would not do, because the parser returns empty tags for them instead of an error (ADR 0005).
