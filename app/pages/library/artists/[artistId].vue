<script setup lang="ts">
import type { Artist, Album, Track } from '#shared/domain'

const route = useRoute()
const router = useRouter()
const artistId = route.params.artistId as string
const tab = ref<'albums' | 'singles' | 'all'>('albums')
const toast = useToast()

const { data: artist } = await useAsyncData(`library:artist:${artistId}`, () =>
  $fetch<Artist>(`/api/library/artists/${artistId}`)
)
const { data: albums } = await useAsyncData('library:albums', () => $fetch<Album[]>('/api/library/albums'))
const { data: tracks, refresh: refreshTracks } = await useAsyncData('library:tracks', () => $fetch<Track[]>('/api/library/tracks'))
const { data: artists } = await useAsyncData('library:artists', () => $fetch<Artist[]>('/api/library/artists'))

const artistAlbums = computed(() =>
  (albums.value || []).filter(a => a.artistId === artistId && a.type !== 'single')
)
const artistSingles = computed(() => {
  const singleAlbumIds = new Set(
    (albums.value || []).filter(a => a.artistId === artistId && a.type === 'single').map(a => a.id)
  )
  return (tracks.value || []).filter(t =>
    t.artistId === artistId && (!t.albumId || singleAlbumIds.has(t.albumId))
  )
})
const artistTracks = computed(() =>
  (tracks.value || []).filter(t => t.artistId === artistId)
)

const artistSize = computed(() => formatBytes(sumTrackSizes(artistTracks.value)))
const artistDuration = computed(() => formatDurationTotal(sumTrackDurations(artistTracks.value)))

const tabItems = [
  { label: 'Albums', value: 'albums' },
  { label: 'Singles', value: 'singles' },
  { label: 'Tous les morceaux', value: 'all' }
]

async function deleteArtist() {
  if (!confirm(`Supprimer « ${artist.value?.name} » et tous ses fichiers ?`)) return
  await $fetch(`/api/library/artists/${artistId}`, { method: 'DELETE' })
  await invalidateLibrary()
  toast.add({ title: 'Artiste supprimé', color: 'success' })
  router.push('/library/artists')
}
</script>

<template>
  <div v-if="artist" class="space-y-8">
    <div class="flex items-end gap-6">
      <SharedMediaThumbnail type="artist" :entity-id="artist.id" :show-caption="false" zoomable class="w-48" />
      <div class="flex-1">
        <h2 class="text-4xl font-bold">{{ artist.name }}</h2>
        <p class="text-muted mt-1">
          {{ artistAlbums.length }} {{ artistAlbums.length === 1 ? 'album' : 'albums' }} ·
          {{ artistTracks.length }} {{ artistTracks.length === 1 ? 'morceau' : 'morceaux' }} ·
          {{ artistDuration }} · {{ artistSize }}
        </p>
        <div class="flex gap-2 mt-4">
          <SharedAddButton :label="`Ajouter à ${artist.name}`" />
          <UButton color="error" variant="soft" icon="i-lucide-trash-2" label="Supprimer l'artiste" @click="deleteArtist" />
        </div>
      </div>
    </div>

    <UTabs v-model="tab" :items="tabItems" />

    <section v-if="tab === 'albums'">
      <div v-if="artistAlbums.length" class="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <NuxtLink v-for="album in artistAlbums" :key="album.id" :to="`/library/albums/${album.id}`">
          <SharedMediaThumbnail :title="album.title" type="album" :entity-id="album.id" />
        </NuxtLink>
      </div>
      <UEmpty v-else icon="i-lucide-disc" title="Aucun album" />
    </section>

    <section v-if="tab === 'singles'">
      <LibraryTrackTable
        v-if="artistSingles.length"
        selectable
        view="artist"
        :tracks="artistSingles"
        :albums="albums || []"
        :artists="artists || []"
        @refresh="refreshTracks()"
      />
      <UEmpty v-else icon="i-lucide-music" title="Aucun single" />
    </section>

    <section v-if="tab === 'all'">
      <LibraryTrackTable
        v-if="artistTracks.length"
        selectable
        view="artist"
        :tracks="artistTracks"
        :albums="albums || []"
        :artists="artists || []"
        @refresh="refreshTracks()"
      />
      <UEmpty v-else icon="i-lucide-music" title="Aucun morceau" />
    </section>
  </div>
</template>
