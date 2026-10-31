<script setup lang="ts">
import type { AlbumDetail } from '#shared/domain/album-detail'
import type { Track, Artist } from '#shared/domain'

const route = useRoute()
const router = useRouter()
const albumId = route.params.albumId as string
const toast = useToast()

const { data: album, refresh: refreshAlbum } = await useFetch<AlbumDetail>(`/api/library/albums/${albumId}`)
const { data: tracks, refresh: refreshTracks } = await useAsyncData('library:tracks', () => $fetch<Track[]>('/api/library/tracks'))
const { data: albums } = await useAsyncData('library:albums', () => $fetch<Album[]>('/api/library/albums'))
const { data: artists } = await useFetch<Artist[]>('/api/library/artists')

const albumTracks = computed(() => {
  if (!album.value || !tracks.value) return []
  return album.value.trackIds
    .map(id => tracks.value!.find(t => t.id === id))
    .filter((t): t is Track => !!t)
})

const artist = computed(() => artists.value?.find(a => a.id === album.value?.artistId))

const albumSize = computed(() => formatBytes(sumTrackSizes(albumTracks.value)))
const albumDuration = computed(() => formatDurationTotal(sumTrackDurations(albumTracks.value)))
const albumReleaseDate = computed(() =>
  album.value?.releaseDate || releaseDateFromTracks(albumTracks.value, album.value?.year)
)
const albumCollaborators = computed(() =>
  aggregateAlbumCollaborators(albumTracks.value, artist.value?.name)
)

const albumMetaLine = computed(() => {
  const parts: string[] = []
  if (albumReleaseDate.value) parts.push(albumReleaseDate.value)
  parts.push(`${albumTracks.value.length} ${albumTracks.value.length === 1 ? 'morceau' : 'morceaux'}`)
  parts.push(albumDuration.value)
  parts.push(albumSize.value)
  return parts.join(' · ')
})

async function deleteAlbum() {
  if (!confirm(`Supprimer l'album « ${album.value?.title} » et tous ses fichiers ?`)) return
  await $fetch(`/api/library/albums/${albumId}`, { method: 'DELETE' })
  await invalidateLibrary()
  toast.add({ title: 'Album supprimé', color: 'success' })
  router.push('/library/albums')
}

const repairing = ref(false)

async function repairAlbum() {
  repairing.value = true
  try {
    const result = await $fetch<{ message: string }>(`/api/library/albums/${albumId}/repair`, { method: 'POST' })
    toast.add({ title: 'Correction terminée', description: result.message, color: 'success' })
    await Promise.all([refreshTracks(), refreshAlbum()])
    await invalidateLibrary()
  } catch (e: unknown) {
    const msg = e && typeof e === 'object' && 'data' in e
      ? String((e as { data?: { message?: string } }).data?.message || 'Erreur')
      : 'Correction échouée'
    toast.add({ title: 'Erreur', description: msg, color: 'error' })
  } finally {
    repairing.value = false
  }
}
</script>

<template>
  <div v-if="album" class="space-y-6">
    <div class="flex items-end gap-6">
      <SharedMediaThumbnail type="album" :entity-id="album.id" :show-caption="false" zoomable class="w-48" />
      <div class="flex-1">
        <div class="text-sm">
          <LibraryArtistLinks
            v-if="artist"
            :primary="artist.name"
            :primary-id="artist.id"
            :collaborators="albumCollaborators"
            :artists="artists || []"
            muted
          />
        </div>
        <h2 class="text-4xl font-bold">{{ album.title }}</h2>
        <p class="text-muted mt-1">{{ albumMetaLine }}</p>
        <p v-if="album.genre" class="text-sm text-muted mt-0.5">{{ album.genre }}</p>
        <div class="flex gap-2 mt-4 flex-wrap">
          <SharedAddButton :label="`Ajouter à ${album.title}`" />
          <UButton
            variant="soft"
            icon="i-lucide-wrench"
            label="Corriger les erreurs"
            :loading="repairing"
            @click="repairAlbum"
          />
          <UButton color="error" variant="soft" icon="i-lucide-trash-2" label="Supprimer l'album" @click="deleteAlbum" />
        </div>
      </div>
    </div>
    <LibraryTrackTable
      selectable
      view="album"
      :album-id="albumId"
      :tracks="albumTracks"
      :albums="albums || []"
      :artists="artists || []"
      @refresh="refreshTracks(); refreshAlbum()"
    />
  </div>
</template>
