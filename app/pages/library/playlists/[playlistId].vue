<script setup lang="ts">
import type { Playlist, Track } from '#shared/domain'
import type { Album, Artist } from '#shared/domain'

const route = useRoute()
const playlistId = route.params.playlistId as string
const toast = useToast()

const { data: playlist, refresh: refreshPlaylist } = await useFetch<Playlist>(`/api/playlists/${playlistId}`)
const { data: allTracks, refresh: refreshTracks } = await useAsyncData('library:tracks', () => $fetch<Track[]>('/api/library/tracks'))
const { data: albums } = await useAsyncData('library:albums', () => $fetch<Album[]>('/api/library/albums'))
const { data: artists } = await useFetch<Artist[]>('/api/library/artists')

const playlistTracks = computed(() => {
  if (!playlist.value || !allTracks.value) return []
  return playlist.value.trackIds
    .map(id => allTracks.value!.find(t => t.id === id))
    .filter((t): t is Track => !!t)
})

const playlistDuration = computed(() => formatDurationTotal(sumTrackDurations(playlistTracks.value)))
const playlistSize = computed(() => formatBytes(sumTrackSizes(playlistTracks.value)))

async function duplicate() {
  const copy = await $fetch<Playlist>(`/api/playlists/${playlistId}/duplicate`, { method: 'POST' })
  toast.add({ title: `Playlist dupliquée : ${copy.name}`, color: 'success' })
}

async function remove() {
  await $fetch(`/api/playlists/${playlistId}`, { method: 'DELETE' })
  toast.add({ title: 'Playlist supprimée', color: 'success' })
  await navigateTo('/library/playlists')
}

async function onRefresh() {
  await syncTrackNumbers()
  await Promise.all([refreshPlaylist(), refreshTracks()])
  await invalidateLibrary()
}

async function syncTrackNumbers() {
  try {
    await $fetch(`/api/playlists/${playlistId}/sync-track-numbers`, { method: 'POST' })
    await refreshTracks()
    await invalidateLibrary()
  } catch (e: unknown) {
    const msg = e && typeof e === 'object' && 'data' in e
      ? String((e as { data?: { message?: string } }).data?.message || 'Erreur')
      : 'Synchronisation des N° fichier échouée'
    toast.add({ title: 'Synchronisation N°', description: msg, color: 'warning' })
  }
}

onMounted(() => {
  syncTrackNumbers()
})

const repairing = ref(false)

async function repairPlaylist() {
  repairing.value = true
  try {
    const result = await $fetch<{ message: string, report?: { errors?: string[] } }>(
      `/api/playlists/${playlistId}/repair`,
      { method: 'POST' }
    )
    const color = result.report?.errors?.length ? 'warning' : 'success'
    toast.add({ title: 'Correction terminée', description: result.message, color })
    await onRefresh()
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
  <div v-if="playlist" class="space-y-6">
    <div class="flex items-end justify-between gap-4 flex-wrap">
      <div>
        <h2 class="text-4xl font-bold">{{ playlist.name }}</h2>
        <p v-if="playlist.description" class="text-muted mt-1">{{ playlist.description }}</p>
        <p class="text-muted">
          {{ playlistTracks.length }} {{ playlistTracks.length === 1 ? 'morceau' : 'morceaux' }} ·
          {{ playlistDuration }} · {{ playlistSize }}
        </p>
      </div>
      <div class="flex gap-2 flex-wrap">
        <SharedAddButton />
        <UButton
          variant="soft"
          icon="i-lucide-wrench"
          label="Corriger les erreurs"
          :loading="repairing"
          @click="repairPlaylist"
        />
        <UButton variant="soft" icon="i-lucide-copy" label="Dupliquer" @click="duplicate" />
        <UButton color="error" variant="soft" icon="i-lucide-trash" label="Supprimer" @click="remove" />
      </div>
    </div>

    <PlaylistTrackTable
      :playlist-id="playlistId"
      :tracks="playlistTracks"
      :albums="albums || []"
      :artists="artists || []"
      @refresh="onRefresh"
    />
  </div>
</template>
