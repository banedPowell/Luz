# Interface principles

How Luz looks and behaves. Read this before changing the interface; change it in the same PR when a principle no longer holds. The decisions come from a mockup discussion with the author before v0.3, summarised here.

## What the interface is for

Luz is a **file manager first**. The interface helps the user see the state of their library (quality, tags, paths), bring music in (downloads) and keep files organised so they work in any player, car or portable device. Playback is a convenience and is not designed yet (after v1.0).

Spotify and Tidal are references for composition only: sidebar, tabs, covers, search. They are not references for behaviour: we show files, formats and paths, not recommendations.

## Principles

1. **Files are visible.** Format, bitrate and path are one click or hover away. An album page shows its folder and each track's file name. Nothing hides that these are real files.
2. **The library is easy to get around.** Search is always reachable. Every list can be sorted; sort, page and view mode live in the URL.
3. **No placeholder controls.** A button exists only when it works. Room for future features (accounts, device profiles) is reserved in the layout, never drawn.
4. **Same pattern everywhere.** A list is a list: tables and grids share the selection bar, the row menu and the empty state. A feature added later plugs into these places.
5. **Use the space.** Tables use the available width without horizontal scrolling; content width is capped around 1440 px. Reading pages (settings, detail text) keep a narrower column.
6. **Plain language.** Download steps read "Converting to FLAC", not log lines. Technical detail sits behind a "Show details" toggle, closed by default.
7. **Safe by default.** Anything that changes or deletes files is explicit and confirmed (see [CLAUDE.md](../../CLAUDE.md)).

## Layout

- Nuxt UI dashboard layout, sidebar in the `inset` variant.
- Sidebar order: Home, Library, Downloads, Playlists (a tree of folders and playlists, nestable at any depth, with an "All playlists" page), then the download status, the theme switch and Settings at the bottom.
- The bottom of the sidebar is where an account menu will go. Nothing is drawn until accounts exist.
- Device profiles will be a sidebar page and an "Export to…" action in selection and row menus, added when the feature exists.
- Library page: tabs Tracks, Albums, Artists; a table/grid switch; a search field. Detail pages for an album and an artist.
- Selection bar: appears above any list when rows are checked. Row menu ("…") on every row. Both carry only actions that exist.
- Home: library folder and last scan, library health (missing covers, missing artist, probable duplicates, missing files; each opens a filtered list), recently added.
- Downloads: URL field, preview of what will be downloaded with the final path of each file, then the queue.

## Mobile

Under the `md` breakpoint the sidebar becomes a drawer opened from the top bar. Tables become compact rows (cover, title, artist, format). The download status stays visible at the bottom. Touch targets are at least 40 px.

## Visual identity

- Dark and light themes as today: neutral greys, black/white primary, Nuxt UI radius.
- Font: DM Sans (sans) and Geist Mono (mono).
- Icons: pixelarticons only, through the `ui.icons` map in `app.config.ts`.
- The pixel-art identity comes from icons, cover placeholders and small details (a blinking cursor after page titles), not from heavy chrome.
- Cover placeholder: a pixel-art cassette whose colour comes from the album name; grey when the name or artist is unknown.
- Progress: the default Nuxt UI progress bar, thin. One overall bar per job plus one per file being downloaded.
- Theme switch: three icon buttons in a rounded pill (light, dark, system), label on hover.
- Quality badge on albums: "Lossless" when every track is, "Mixed" otherwise.
- New items (after a scan or download) show a "New" badge for a while.

## Keyboard

`/` focuses search, `g` then `l` opens the library, `v` switches table and grid, `?` shows the shortcuts. Shortcuts never trigger inside text fields.

## Later, not now

Custom themes and a choice of icon library (after v1.0), accounts and profiles, device profiles, an audio player. Their layout slots are described above; their interface is designed when their milestone starts.
