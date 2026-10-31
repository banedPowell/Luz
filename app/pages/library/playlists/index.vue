<script setup lang="ts">
import type { Playlist } from '#shared/domain'

const { data: playlists, refresh } = await useFetch<Playlist[]>('/api/playlists')
const newName = ref('')
const toast = useToast()

async function createPlaylist() {
  if (!newName.value.trim()) return
  await $fetch('/api/playlists', {
    method: 'POST',
    body: { name: newName.value.trim() }
  })
  newName.value = ''
  await refresh()
  toast.add({ title: 'Playlist créée', color: 'success' })
}
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-6">
      <h2 class="text-2xl font-bold">Playlists</h2>
      <SharedAddButton />
    </div>

    <div class="flex gap-2 mb-6 max-w-md">
      <UInput v-model="newName" placeholder="Nouvelle playlist..." class="flex-1" />
      <UButton icon="i-lucide-plus" label="Créer" @click="createPlaylist" />
    </div>

    <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
      <NuxtLink
        v-for="playlist in playlists"
        :key="playlist.id"
        :to="`/library/playlists/${playlist.id}`"
        class="hover:opacity-80"
      >
        <SharedMediaThumbnail :title="playlist.name" type="playlist" />
      </NuxtLink>
    </div>
    <p v-if="!playlists?.length" class="text-muted mt-8">Aucune playlist</p>
  </div>
</template>
