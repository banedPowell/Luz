<script setup lang="ts">
import type { Track } from '#shared/domain'
import type { Album } from '#shared/domain/album'
import type { Artist } from '#shared/domain/artist'
import type { TrackMetadata } from '#shared/domain/track'
import { formatTrackNumberForDisplay, resolveTrackNumberForDisplay } from '#shared/utils/track-number'
import { formatTrackLabel } from '#shared/utils/track-display'

const props = defineProps<{
  tracks: Track[]
  albums?: Album[]
  artists?: Artist[]
  /** Contexte d'affichage : album (artistes+feats), artist (albums+feats), list (tout) */
  view?: 'album' | 'artist' | 'list'
  selectable?: boolean
  albumId?: string
}>()

const emit = defineEmits<{
  refresh: []
}>()

const displayView = computed(() => props.view ?? (props.albumId ? 'album' : 'list'))
const showArtistColumn = computed(() => displayView.value === 'album' || displayView.value === 'list')
const showAlbumColumn = computed(() => displayView.value === 'artist' || displayView.value === 'list')
const showFeatColumn = computed(() =>
  displayView.value === 'artist'
  && props.tracks.some(t => getTrackArtistsDisplay(t).collaborators.length > 0)
)

const toast = useToast()
const { showError } = useAppToast()
const items = computed(() => props.tracks)
const { selectedIds, selectedCount, hasSelection, toggle, selectAll, clear, isSelected } = useBulkSelection(items)

const sortKey = ref<'trackNumber' | 'title' | 'artist' | 'album' | 'duration' | 'size' | 'format' | null>(null)
const sortDir = ref<'asc' | 'desc'>('asc')

const showTrackNumberColumn = computed(() => !!props.albumId)

const editing = ref<Track | null>(null)
const editOpen = ref(false)
const editMeta = ref<TrackMetadata>({ artist: '', title: '' })
const detailsTrackId = ref<string | null>(null)
const detailsOpen = ref(false)
const deleting = ref(false)
const saving = ref(false)

function albumForTrack(track: Track) {
  if (!track.albumId || !props.albums?.length) return undefined
  return props.albums.find(a => a.id === track.albumId)
}

function albumTitle(track: Track) {
  const album = albumForTrack(track)
  return album?.title || track.metadata.library.album || '—'
}

function primaryArtistId(track: Track) {
  if (track.artistId) return track.artistId
  const { primary } = getTrackArtistsDisplay(track)
  return resolveArtistByName(primary, props.artists)?.id
}

function trackNumber(track: Track): number | string {
  return formatTrackNumberForDisplay(track)
}

function formatDuration(seconds?: number) {
  if (!seconds) return '—'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

const sortedTracks = computed(() => {
  const list = [...props.tracks]
  if (!sortKey.value) return list
  const dir = sortDir.value === 'asc' ? 1 : -1
  list.sort((a, b) => {
    let va: string | number = ''
    let vb: string | number = ''
    const ai = list.indexOf(a)
    const bi = list.indexOf(b)
    switch (sortKey.value) {
      case 'trackNumber':
        va = resolveTrackNumberForDisplay(a) ?? 0
        vb = resolveTrackNumberForDisplay(b) ?? 0
        break
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

function toggleSort(key: typeof sortKey.value) {
  if (sortKey.value === key) sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
  else { sortKey.value = key; sortDir.value = 'asc' }
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

function sanitizeMeta(meta: TrackMetadata): TrackMetadata {
  const out: TrackMetadata = { ...meta }
  if (out.trackNumber != null && Number.isNaN(Number(out.trackNumber))) delete out.trackNumber
  if (out.discNumber != null && Number.isNaN(Number(out.discNumber))) delete out.discNumber
  if (out.year != null && Number.isNaN(Number(out.year))) delete out.year
  if (out.album === '') delete out.album
  if (out.comment === '') delete out.comment
  if (out.genre === '') delete out.genre
  return out
}

async function saveEdit() {
  if (!editing.value) return
  saving.value = true
  try {
    const library = sanitizeMeta(editMeta.value)
    const result = await $fetch<{ _warning?: string }>(`/api/library/tracks/${editing.value.id}`, {
      method: 'PATCH',
      body: { metadata: { library } }
    })
    await invalidateLibrary()
    if (result._warning) {
      toast.add({ title: 'Index mis à jour', description: result._warning, color: 'warning' })
    } else {
      toast.add({ title: 'Métadonnées mises à jour', color: 'success' })
    }
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
  await $fetch(`/api/library/tracks/${track.id}`, { method: 'DELETE' })
  await invalidateLibrary()
  emit('refresh')
}

async function bulkDelete() {
  const ids = [...selectedIds.value]
  if (!ids.length) return
  if (!confirm(`Supprimer ${ids.length} morceau(x) et leurs fichiers du disque ?`)) return
  deleting.value = true
  try {
    await $fetch('/api/library/tracks/bulk-delete', { method: 'POST', body: { ids } })
    await invalidateLibrary()
    clear()
    emit('refresh')
    toast.add({ title: `${ids.length} morceau(x) supprimé(s)`, color: 'success' })
  } finally {
    deleting.value = false
  }
}

const menuItems = (track: Track) => [[
  { label: 'Afficher les crédits', icon: 'i-lucide-info', onSelect: () => openDetails(track) },
  { label: 'Modifier', icon: 'i-lucide-pencil', onSelect: () => openEdit(track) },
  { label: 'Supprimer', icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => deleteOne(track) }
]]
</script>

<template>
  <div class="space-y-3">
    <div
      v-if="selectable && hasSelection"
      class="sticky top-0 z-10 flex items-center justify-between gap-2 p-2 rounded-lg bg-elevated border border-default"
    >
      <span class="text-sm">{{ selectedCount }} sélectionné(s)</span>
      <div class="flex gap-2">
        <UButton size="xs" variant="ghost" label="Tout" @click="selectAll" />
        <UButton size="xs" variant="ghost" label="Aucun" @click="clear" />
        <UButton size="xs" color="error" label="Supprimer" :loading="deleting" @click="bulkDelete" />
      </div>
    </div>

    <div v-if="tracks.length" class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-default text-left text-muted">
            <th v-if="selectable" class="p-2 w-8" />
            <th
              v-if="showTrackNumberColumn"
              class="p-2 w-12 text-center cursor-pointer hover:text-default"
              @click="toggleSort('trackNumber')"
            >
              #
            </th>
            <th class="p-2 cursor-pointer hover:text-default" @click="toggleSort('title')">Titre</th>
            <th
              v-if="showArtistColumn"
              class="p-2 cursor-pointer hover:text-default min-w-[140px]"
              @click="toggleSort('artist')"
            >
              {{ displayView === 'album' ? 'Artiste(s)' : 'Artiste' }}
            </th>
            <th
              v-if="showFeatColumn"
              class="p-2 min-w-[120px] text-muted"
            >
              Autres artistes
            </th>
            <th
              v-if="showAlbumColumn"
              class="p-2 cursor-pointer hover:text-default min-w-[140px]"
              @click="toggleSort('album')"
            >
              Album
            </th>
            <th class="p-2 cursor-pointer hover:text-default" @click="toggleSort('duration')">Durée</th>
            <th class="p-2 cursor-pointer hover:text-default" @click="toggleSort('format')">Format</th>
            <th class="p-2 cursor-pointer hover:text-default" @click="toggleSort('size')">Taille</th>
            <th class="p-2 w-10" />
          </tr>
        </thead>
        <tbody>
          <UContextMenu
            v-for="(track, index) in sortedTracks"
            :key="track.id"
            :items="menuItems(track)"
          >
            <tr class="border-b border-default/50 hover:bg-elevated/50">
              <td v-if="selectable" class="p-2">
                <UCheckbox :model-value="isSelected(track.id)" @update:model-value="toggle(track.id)" />
              </td>
              <td v-if="showTrackNumberColumn" class="p-2 text-center text-muted tabular-nums">
                {{ trackNumber(track) }}
              </td>
              <td class="p-2 max-w-[220px]">
                <LibraryTrackTitleCell
                  :track="track"
                  :albums="albums"
                  :context-tracks="sortedTracks"
                />
              </td>
              <td v-if="showArtistColumn" class="p-2 max-w-[220px]">
                <LibraryArtistLinks
                  :primary="getTrackArtistsDisplay(track).primary"
                  :primary-id="primaryArtistId(track)"
                  :collaborators="getTrackArtistsDisplay(track).collaborators"
                  :artists="artists"
                  muted
                />
              </td>
              <td v-if="showFeatColumn" class="p-2 max-w-[180px]">
                <LibraryArtistLinks
                  v-if="getTrackArtistsDisplay(track).collaborators.length"
                  collaborators-only
                  :collaborators="getTrackArtistsDisplay(track).collaborators"
                  :artists="artists"
                  muted
                />
                <span v-else class="text-muted">—</span>
              </td>
              <td v-if="showAlbumColumn" class="p-2 max-w-[180px]">
                <LibraryAlbumLink
                  :title="albumTitle(track)"
                  :album-id="track.albumId"
                  muted
                />
              </td>
              <td class="p-2 text-muted">{{ formatDuration(track.file.duration) }}</td>
              <td class="p-2 text-muted uppercase">{{ track.file.format || '—' }}</td>
              <td class="p-2 text-muted">{{ formatBytes(track.file.size) }}</td>
              <td class="p-2">
                <UDropdownMenu :items="menuItems(track)">
                  <UButton size="xs" variant="ghost" icon="i-lucide-ellipsis" />
                </UDropdownMenu>
              </td>
            </tr>
          </UContextMenu>
        </tbody>
      </table>
    </div>
    <p v-else class="text-muted text-sm py-4">Aucun morceau</p>

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
