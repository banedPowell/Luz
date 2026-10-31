<script setup lang="ts">
import type { Track } from '#shared/domain'
import type { Album } from '#shared/domain/album'
import type { Artist } from '#shared/domain/artist'
import type { TrackMetadata } from '#shared/domain/track'
import { formatTrackNumberForDisplay, resolveTrackNumberForDisplay } from '#shared/utils/track-number'
import { formatTrackLabel } from '#shared/utils/track-display'
import { moveArrayElement, useSortable } from '@vueuse/integrations/useSortable'

const props = defineProps<{
  playlistId: string
  tracks: Track[]
  albums?: Album[]
  artists?: Artist[]
}>()

const emit = defineEmits<{ refresh: [] }>()

const toast = useToast()
const { showError } = useAppToast()

const listRef = ref<HTMLElement | null>(null)
const localTracks = ref<Track[]>([])
const savingOrder = ref(false)

const sortKey = ref<'trackNumber' | 'title' | 'artist' | 'album' | 'duration' | 'size' | 'format' | null>(null)
const sortDir = ref<'asc' | 'desc'>('asc')

watch(() => props.tracks.map(t => t.id).join('|'), (ids) => {
  if (savingOrder.value) return
  const currentIds = localTracks.value.map(t => t.id).join('|')
  if (currentIds === ids) {
    localTracks.value = localTracks.value.map(lt => props.tracks.find(t => t.id === lt.id) ?? lt)
    return
  }
  localTracks.value = [...props.tracks]
}, { immediate: true })

function displayTrackNumber(track: Track) {
  return formatTrackNumberForDisplay(track)
}

function albumTitle(track: Track) {
  if (!track.albumId || !props.albums?.length) return track.metadata.library.album || '—'
  return props.albums.find(a => a.id === track.albumId)?.title || track.metadata.library.album || '—'
}

const sortedTracks = computed(() => {
  const list = [...localTracks.value]
  if (!sortKey.value) return list
  const dir = sortDir.value === 'asc' ? 1 : -1
  list.sort((a, b) => {
    let va: string | number = ''
    let vb: string | number = ''
    switch (sortKey.value) {
      case 'trackNumber': {
        const na = resolveTrackNumberForDisplay(a)
        const nb = resolveTrackNumberForDisplay(b)
        if (na == null && nb == null) return 0
        if (na == null) return 1
        if (nb == null) return -1
        return (na - nb) * dir
      }
      case 'title': va = a.metadata.library.title; vb = b.metadata.library.title; break
      case 'artist': va = trackArtistsSortLabel(a); vb = trackArtistsSortLabel(b); break
      case 'album': va = albumTitle(a); vb = albumTitle(b); break
      case 'duration': va = a.file.duration || 0; vb = b.file.duration || 0; break
      case 'size': va = a.file.size || 0; vb = b.file.size || 0; break
      case 'format': va = a.file.format || ''; vb = b.file.format || ''; break
    }
    if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir
    return String(va).localeCompare(String(vb)) * dir
  })
  return list
})

function rowGridClass(sortable: boolean) {
  return [
    sortable ? 'sortable-row' : '',
    'flex flex-col md:grid gap-1 md:gap-3 md:items-center px-3 py-2.5 hover:bg-elevated/50'
  ]
}

function toggleSort(key: typeof sortKey.value) {
  if (sortKey.value === key) sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
  else { sortKey.value = key; sortDir.value = 'asc' }
}

useSortable(listRef, localTracks, {
  animation: 150,
  handle: '.drag-handle',
  draggable: '.sortable-row',
  watchElement: true,
  onUpdate: (e) => {
    if (sortKey.value) sortKey.value = null
    moveArrayElement(localTracks, e.oldIndex!, e.newIndex!, e)
    nextTick(async () => {
      savingOrder.value = true
      try {
        await $fetch(`/api/playlists/${props.playlistId}/tracks`, {
          method: 'PATCH',
          body: { trackIds: localTracks.value.map(t => t.id) }
        })
        await invalidateLibrary()
        emit('refresh')
      } catch (err: unknown) {
        localTracks.value = [...props.tracks]
        const msg = err && typeof err === 'object' && 'data' in err
          ? String((err as { data?: { message?: string } }).data?.message || 'Erreur')
          : 'Impossible de sauvegarder l\'ordre'
        showError('Réordonnancement échoué', msg)
      } finally {
        savingOrder.value = false
      }
    })
  }
})

const editing = ref<Track | null>(null)
const editOpen = ref(false)
const editMeta = ref<TrackMetadata>({ artist: '', title: '' })
const detailsTrackId = ref<string | null>(null)
const detailsOpen = ref(false)
const saving = ref(false)

function primaryArtistId(track: Track) {
  if (track.artistId) return track.artistId
  const { primary } = getTrackArtistsDisplay(track)
  return resolveArtistByName(primary, props.artists)?.id
}

function formatDuration(seconds?: number) {
  if (!seconds) return '—'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

function openEdit(track: Track) {
  editing.value = track
  editMeta.value = {
    ...track.metadata.library,
    trackNumber: resolveTrackNumberForDisplay(track) ?? track.metadata.library.trackNumber
  }
  editOpen.value = true
}

function openDetails(track: Track) {
  detailsTrackId.value = track.id
  detailsOpen.value = true
}

async function saveEdit() {
  if (!editing.value) return
  saving.value = true
  try {
    await $fetch(`/api/library/tracks/${editing.value.id}`, {
      method: 'PATCH',
      body: { metadata: { library: editMeta.value } }
    })
    await invalidateLibrary()
    toast.add({ title: 'Métadonnées mises à jour', color: 'success' })
    editOpen.value = false
    emit('refresh')
  } catch (e: unknown) {
    const msg = e && typeof e === 'object' && 'data' in e
      ? String((e as { data?: { message?: string } }).data?.message || 'Erreur')
      : 'Erreur lors de la modification'
    showError('Erreur', msg)
  } finally {
    saving.value = false
  }
}

async function deleteOne(track: Track) {
  if (!confirm(`Supprimer « ${formatTrackLabel(track, props.albums)} » et son fichier ?`)) return
  try {
    await $fetch(`/api/library/tracks/${track.id}`, { method: 'DELETE' })
    await invalidateLibrary()
    emit('refresh')
  } catch (e: unknown) {
    const msg = e && typeof e === 'object' && 'data' in e
      ? String((e as { data?: { message?: string } }).data?.message || 'Erreur')
      : 'Suppression échouée'
    showError('Erreur', msg)
  }
}

const menuItems = (track: Track) => [[
  { label: 'Afficher les crédits', icon: 'i-lucide-info', onSelect: () => openDetails(track) },
  { label: 'Modifier', icon: 'i-lucide-pencil', onSelect: () => openEdit(track) },
  { label: 'Supprimer', icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => deleteOne(track) }
]]
</script>

<template>
  <div class="space-y-2">
    <div
      class="hidden md:grid gap-3 px-3 py-2 text-xs font-medium text-muted border-b border-default"
      style="grid-template-columns: 2rem 2.5rem minmax(0,1.4fr) minmax(0,1fr) minmax(0,1fr) 4rem 3.5rem 4rem 2.5rem"
    >
      <span />
      <button type="button" class="text-center hover:text-default cursor-pointer" @click="toggleSort('trackNumber')">
        #{{ sortKey === 'trackNumber' ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '' }}
      </button>
      <button type="button" class="text-left hover:text-default cursor-pointer truncate" @click="toggleSort('title')">
        Titre{{ sortKey === 'title' ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '' }}
      </button>
      <button type="button" class="text-left hover:text-default cursor-pointer truncate" @click="toggleSort('artist')">
        Artiste{{ sortKey === 'artist' ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '' }}
      </button>
      <button type="button" class="text-left hover:text-default cursor-pointer truncate" @click="toggleSort('album')">
        Album{{ sortKey === 'album' ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '' }}
      </button>
      <button type="button" class="hover:text-default cursor-pointer" @click="toggleSort('duration')">
        Durée{{ sortKey === 'duration' ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '' }}
      </button>
      <button type="button" class="hover:text-default cursor-pointer" @click="toggleSort('format')">
        Format{{ sortKey === 'format' ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '' }}
      </button>
      <button type="button" class="hover:text-default cursor-pointer" @click="toggleSort('size')">
        Taille{{ sortKey === 'size' ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '' }}
      </button>
      <span />
    </div>

    <p v-if="sortKey" class="text-xs text-muted px-1">
      Tri actif — le glisser-déposer est désactivé. Cliquez à nouveau sur une colonne pour inverser le tri.
    </p>

    <div
      v-if="sortKey"
      class="divide-y divide-default rounded-lg border border-default"
    >
      <div
        v-for="track in sortedTracks"
        :key="track.id"
        :class="rowGridClass(false)"
        style="grid-template-columns: 2rem 2.5rem minmax(0,1.4fr) minmax(0,1fr) minmax(0,1fr) 4rem 3.5rem 4rem 2.5rem"
      >
        <span class="shrink-0" />
        <span class="text-center text-muted tabular-nums text-sm">{{ displayTrackNumber(track) }}</span>
        <LibraryTrackTitleCell
          :track="track"
          :albums="albums"
          :context-tracks="sortedTracks"
        />
        <div class="min-w-0 truncate text-sm">
          <LibraryArtistLinks
            :primary="getTrackArtistsDisplay(track).primary"
            :primary-id="primaryArtistId(track)"
            :collaborators="getTrackArtistsDisplay(track).collaborators"
            :artists="artists"
            muted
          />
        </div>
        <div class="min-w-0 truncate text-sm">
          <LibraryAlbumLink
            :title="albumTitle(track)"
            :album-id="track.albumId"
            muted
          />
        </div>
        <span class="text-sm text-muted tabular-nums">{{ formatDuration(track.file.duration) }}</span>
        <span class="text-sm text-muted uppercase">{{ track.file.format || '—' }}</span>
        <span class="text-sm text-muted tabular-nums">{{ formatBytes(track.file.size) }}</span>
        <div class="flex justify-end">
          <UDropdownMenu :items="menuItems(track)">
            <UButton size="xs" variant="ghost" icon="i-lucide-ellipsis" />
          </UDropdownMenu>
        </div>
      </div>
    </div>

    <div
      v-else
      ref="listRef"
      class="divide-y divide-default rounded-lg border border-default"
    >
      <div
        v-for="track in localTracks"
        :key="track.id"
        :class="rowGridClass(true)"
        style="grid-template-columns: 2rem 2.5rem minmax(0,1.4fr) minmax(0,1fr) minmax(0,1fr) 4rem 3.5rem 4rem 2.5rem"
      >
        <UIcon
          name="i-lucide-grip-vertical"
          class="drag-handle text-muted cursor-grab active:cursor-grabbing shrink-0 self-start md:self-center"
        />
        <span class="text-center text-muted tabular-nums text-sm">{{ displayTrackNumber(track) }}</span>
        <LibraryTrackTitleCell
          :track="track"
          :albums="albums"
          :context-tracks="localTracks"
        />
        <div class="min-w-0 truncate text-sm">
          <LibraryArtistLinks
            :primary="getTrackArtistsDisplay(track).primary"
            :primary-id="primaryArtistId(track)"
            :collaborators="getTrackArtistsDisplay(track).collaborators"
            :artists="artists"
            muted
          />
        </div>
        <div class="min-w-0 truncate text-sm">
          <LibraryAlbumLink
            :title="albumTitle(track)"
            :album-id="track.albumId"
            muted
          />
        </div>
        <span class="text-sm text-muted tabular-nums">{{ formatDuration(track.file.duration) }}</span>
        <span class="text-sm text-muted uppercase">{{ track.file.format || '—' }}</span>
        <span class="text-sm text-muted tabular-nums">{{ formatBytes(track.file.size) }}</span>
        <div class="flex justify-end">
          <UDropdownMenu :items="menuItems(track)">
            <UButton size="xs" variant="ghost" icon="i-lucide-ellipsis" />
          </UDropdownMenu>
        </div>
      </div>
    </div>

    <p v-if="!localTracks.length" class="text-muted text-sm py-4">Playlist vide</p>

    <USlideover v-model:open="editOpen" title="Éditer les métadonnées">
      <template #body>
        <SharedMetadataEditor v-model="editMeta" />
      </template>
      <template #footer>
        <UButton label="Enregistrer" :loading="saving" @click="saveEdit" />
      </template>
    </USlideover>

    <LibraryTrackDetailsSlideover
      v-model:open="detailsOpen"
      :track-id="detailsTrackId"
      :artists="artists"
      :albums="albums"
    />
  </div>
</template>
