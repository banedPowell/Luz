<script setup lang="ts">
import type { Album } from '#shared/domain'

const { data: albums, refresh } = await useAsyncData('library:albums', () => $fetch<Album[]>('/api/library/albums'))
const items = computed(() => albums.value || [])
const { selectedIds, selectedCount, hasSelection, toggle, selectAll, clear, isSelected } = useBulkSelection(items)
const toast = useToast()

async function bulkDelete() {
  const ids = [...selectedIds.value]
  if (!ids.length || !confirm(`Supprimer ${ids.length} album(s) et leurs fichiers ?`)) return
  await $fetch('/api/library/albums/bulk-delete', { method: 'POST', body: { ids } })
  await invalidateLibrary()
  clear()
  await refresh()
  toast.add({ title: `${ids.length} album(s) supprimé(s)`, color: 'success' })
}
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-6">
      <h2 class="text-2xl font-bold">Albums</h2>
      <UButton v-if="hasSelection" size="sm" color="error" :label="`Supprimer (${selectedCount})`" @click="bulkDelete" />
    </div>
    <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
      <div v-for="album in albums" :key="album.id" class="relative">
        <UCheckbox class="absolute top-2 left-2 z-10" :model-value="isSelected(album.id)" @update:model-value="toggle(album.id)" @click.stop />
        <NuxtLink :to="`/library/albums/${album.id}`">
          <SharedMediaThumbnail :title="album.title" type="album" :entity-id="album.id" />
        </NuxtLink>
      </div>
    </div>
    <p v-if="!albums?.length" class="text-muted mt-8">Aucun album</p>
  </div>
</template>
