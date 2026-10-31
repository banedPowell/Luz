<script setup lang="ts">
import type { Track } from '#shared/domain'

const { data: tracks, refresh } = await useAsyncData('library:tracks', () => $fetch<Track[]>('/api/library/tracks'))
const { data: albums } = await useAsyncData('library:albums', () => $fetch('/api/library/albums'))
const { data: artists } = await useAsyncData('library:artists', () => $fetch('/api/library/artists'))

const trackList = computed(() => tracks.value || [])

const tracksMeta = computed(() => {
  const list = trackList.value
  const artistIds = new Set(list.map(t => t.artistId))
  const albumIds = new Set(list.filter(t => t.albumId).map(t => t.albumId!))
  const formats = new Set(list.map(t => t.file.format?.toLowerCase()).filter(Boolean))

  return {
    count: list.length,
    artists: artistIds.size,
    albums: albumIds.size,
    formats: formats.size,
    duration: formatDurationTotal(sumTrackDurations(list)),
    size: formatBytes(sumTrackSizes(list))
  }
})

const tracksMetaLine = computed(() => {
  const m = tracksMeta.value
  if (!m.count) return 'Aucun morceau'
  const parts = [
    `${m.count} ${m.count === 1 ? 'morceau' : 'morceaux'}`,
    `${m.artists} ${m.artists === 1 ? 'artiste' : 'artistes'}`,
    `${m.albums} ${m.albums === 1 ? 'album' : 'albums'}`,
    m.duration,
    m.size
  ]
  if (m.formats > 1) {
    parts.splice(4, 0, `${m.formats} formats`)
  }
  return parts.join(' · ')
})
</script>

<template>
  <div>
    <div class="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
      <div>
        <h2 class="text-2xl font-bold">Morceaux</h2>
        <p class="text-muted mt-1">{{ tracksMetaLine }}</p>
      </div>
      <SharedAddButton class="shrink-0" />
    </div>
    <LibraryTrackTable
      selectable
      view="list"
      :tracks="trackList"
      :albums="albums || []"
      :artists="artists || []"
      @refresh="refresh()"
    />
  </div>
</template>
