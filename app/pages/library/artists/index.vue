<script setup lang="ts">
import type { Artist } from '#shared/domain'

const { data: artists, refresh } = await useAsyncData('library:artists', () => $fetch<Artist[]>('/api/library/artists'))
const items = computed(() => artists.value || [])
const { selectedIds, selectedCount, hasSelection, toggle, selectAll, clear, isSelected } = useBulkSelection(items)
const toast = useToast()

async function bulkDelete() {
  const ids = [...selectedIds.value]
  if (!ids.length || !confirm(`Supprimer ${ids.length} artiste(s) et tous leurs fichiers ?`)) return
  await $fetch('/api/library/artists/bulk-delete', { method: 'POST', body: { ids } })
  await invalidateLibrary()
  clear()
  await refresh()
  toast.add({ title: `${ids.length} artiste(s) supprimé(s)`, color: 'success' })
}
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-6">
      <h2 class="text-2xl font-bold">Artistes</h2>
      <div class="flex gap-2">
        <UButton v-if="hasSelection" size="sm" color="error" :label="`Supprimer (${selectedCount})`" @click="bulkDelete" />
        <SharedAddButton />
      </div>
    </div>
    <div v-if="hasSelection" class="mb-4 flex gap-2">
      <UButton size="xs" variant="ghost" label="Tout sélectionner" @click="selectAll" />
      <UButton size="xs" variant="ghost" label="Annuler" @click="clear" />
    </div>
    <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
      <div v-for="artist in artists" :key="artist.id" class="relative group">
        <UCheckbox
          class="absolute top-2 left-2 z-10"
          :model-value="isSelected(artist.id)"
          @update:model-value="toggle(artist.id)"
          @click.stop
        />
        <NuxtLink :to="`/library/artists/${artist.id}`" class="block hover:opacity-80">
          <SharedMediaThumbnail :title="artist.name" type="artist" :entity-id="artist.id" />
        </NuxtLink>
      </div>
    </div>
    <p v-if="!artists?.length" class="text-muted mt-8">Aucun artiste</p>
  </div>
</template>
