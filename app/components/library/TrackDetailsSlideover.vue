<script setup lang="ts">
import type { TrackDetails, DetailRow } from '#shared/domain/track-details'
import type { Artist } from '#shared/domain'
import type { Album } from '#shared/domain/album'

const props = defineProps<{
  trackId: string | null
  artists?: Artist[]
  albums?: Album[]
}>()

const open = defineModel<boolean>('open', { default: false })

const details = ref<TrackDetails | null>(null)
const pending = ref(false)

watch([() => props.trackId, open], async ([id, isOpen]) => {
  if (!isOpen || !id) {
    details.value = null
    return
  }
  pending.value = true
  try {
    details.value = await $fetch<TrackDetails>(`/api/library/tracks/${id}/details`)
  } catch {
    details.value = null
  } finally {
    pending.value = false
  }
}, { immediate: true })

const sections = computed(() => {
  if (!details.value) return []
  return [
    { title: 'Crédits', rows: details.value.credits },
    { title: 'Technique', rows: details.value.technical },
    { title: 'Fichier', rows: details.value.file },
    { title: 'Source', rows: details.value.source },
    { title: 'Autres métadonnées', rows: details.value.other, collapsible: true }
  ].filter(s => s.rows.length > 0)
})

function rowLink(row: DetailRow): { type: 'artist' | 'album', id: string } | null {
  const label = row.label.toLowerCase()
  if (['artiste', 'artist', 'artiste principal', 'album artist', 'compositeur', 'albumartist'].some(k => label.includes(k))) {
    const id = resolveArtistByName(row.value, props.artists)?.id
    if (id) return { type: 'artist', id }
  }
  if (label.includes('album')) {
    const album = props.albums?.find(a => a.title.toLowerCase() === row.value.trim().toLowerCase())
    if (album) return { type: 'album', id: album.id }
  }
  return null
}

function isMultiArtistRow(row: DetailRow): boolean {
  const label = row.label.toLowerCase()
  return (label.includes('artiste') || label === 'artist') && row.value.includes(',')
}

function splitArtistNames(value: string) {
  const names = value.split(/\s*,\s*|\s*&\s*/).map(s => s.trim()).filter(Boolean)
  return {
    primary: names[0] || value,
    collaborators: names.slice(1)
  }
}
</script>

<template>
  <USlideover v-model:open="open" title="Crédits et informations">
    <template #body>
      <div v-if="pending" class="flex justify-center py-8">
        <UIcon name="i-lucide-loader-circle" class="size-8 animate-spin text-muted" />
      </div>
      <div v-else-if="details" class="space-y-6">
        <section v-for="section in sections" :key="section.title">
          <h3 class="font-semibold text-sm uppercase tracking-wide text-muted mb-3">
            {{ section.title }}
          </h3>
          <dl class="space-y-2">
            <div
              v-for="row in section.rows"
              :key="`${section.title}-${row.label}`"
              class="grid grid-cols-[minmax(0,35%)_1fr] gap-2 text-sm"
            >
              <dt class="text-muted">{{ row.label }}</dt>
              <dd class="break-all">
                <LibraryArtistLinks
                  v-if="isMultiArtistRow(row)"
                  :primary="splitArtistNames(row.value).primary"
                  :primary-id="resolveArtistByName(splitArtistNames(row.value).primary, artists)?.id"
                  :collaborators="splitArtistNames(row.value).collaborators"
                  :artists="artists"
                />
                <NuxtLink
                  v-else-if="rowLink(row)?.type === 'artist'"
                  :to="`/library/artists/${rowLink(row)!.id}`"
                  class="hover:text-primary hover:underline"
                >
                  {{ row.value }}
                </NuxtLink>
                <NuxtLink
                  v-else-if="rowLink(row)?.type === 'album'"
                  :to="`/library/albums/${rowLink(row)!.id}`"
                  class="hover:text-primary hover:underline"
                >
                  {{ row.value }}
                </NuxtLink>
                <span v-else>{{ row.value }}</span>
              </dd>
            </div>
          </dl>
        </section>
      </div>
      <p v-else class="text-muted text-sm">Aucune information disponible</p>
    </template>
  </USlideover>
</template>
