<script setup lang="ts">
import type { DownloadAnalysis, DownloadTrackItem, DestinationContext } from '#shared/domain/download'
import type { CacheConflict } from '#shared/domain/cache'

const route = useRoute()
const queueStore = useDownloadQueueStore()
const { settings } = useSettings()
const toast = useToast()
const { showError } = useAppToast()

const url = ref((route.query.url as string) || '')
const analyzing = ref(false)
const analysis = ref<DownloadAnalysis | null>(null)
const conflicts = ref<CacheConflict[]>([])
const customArgs = ref('')
const commandPreview = ref('')
const historyOpen = ref(false)
const editingTrack = ref<DownloadTrackItem | null>(null)
const editOpen = ref(false)
const outputTemplate = ref('')

const options = reactive({
  format: 'm4a',
  quality: 'best',
  embedCover: true,
  writeMetadata: true,
  featStrategy: 'metadata_only' as const,
  destinationMode: 'auto' as const
})

function applySettingsDefaults(s: NonNullable<typeof settings.value>) {
  const d = s.downloadDefaults
  options.format = d.format || 'm4a'
  options.quality = d.quality || 'best'
  options.embedCover = d.embedCover ?? true
  options.writeMetadata = d.writeMetadata ?? true
  options.featStrategy = s.metadataRules?.featStrategy || 'metadata_only'
  outputTemplate.value = ''
}

watch(settings, (s) => {
  if (s) applySettingsDefaults(s)
}, { immediate: true })

const destinationContext = computed<DestinationContext>(() => {
  const type = (route.query.context as DestinationContext['type']) || 'root'
  return {
    type,
    artistId: route.query.artistId as string | undefined,
    albumId: route.query.albumId as string | undefined,
    playlistId: route.query.playlistId as string | undefined
  }
})

const { data: contextArtist } = await useFetch(
  () => destinationContext.value.artistId ? `/api/library/artists/${destinationContext.value.artistId}` : null
)
const { data: contextAlbum } = await useFetch(
  () => destinationContext.value.albumId ? `/api/library/albums/${destinationContext.value.albumId}` : null
)
const { data: contextPlaylist } = await useFetch(
  () => destinationContext.value.playlistId ? `/api/playlists/${destinationContext.value.playlistId}` : null
)

const contextLabel = computed(() => {
  const ctx = destinationContext.value
  if (ctx.type === 'artist' && contextArtist.value) return contextArtist.value.name
  if (ctx.type === 'album' && contextAlbum.value) return contextAlbum.value.title
  if (ctx.type === 'playlist' && contextPlaylist.value) return contextPlaylist.value.name
  if (ctx.type === 'singles' && contextArtist.value) return `${contextArtist.value.name} · Singles`
  return 'Bibliothèque'
})

/** Fusionne la progression SSE de la file avec les morceaux analysés (même ids). */
const activeJob = computed(() =>
  queueStore.jobs.find(j =>
    j.url === url.value.trim()
    && !['finished', 'cancelled', 'failed'].includes(j.status)
  )
)

const displayTracks = computed(() => {
  if (!analysis.value) return []
  if (!activeJob.value) return analysis.value.tracks
  return analysis.value.tracks.map((t) => {
    const live = activeJob.value!.tracks.find(jt => jt.id === t.id)
    if (!live) return t
    return { ...t, progress: live.progress, status: live.status }
  })
})

watch(() => route.query.url, (v) => {
  if (v && typeof v === 'string') {
    url.value = v
    analyze()
  }
}, { immediate: true })

watch([options, url, destinationContext, outputTemplate, customArgs, analysis], () => {
  refreshCommandPreview()
}, { deep: true })

async function refreshCommandPreview() {
  if (!url.value.trim() || url.value.trim().startsWith('ERROR:')) return
  try {
    const res = await $fetch<{ command: string }>('/api/downloads/preview', {
      method: 'POST',
      body: {
        url: url.value.trim(),
        options: { ...options, featStrategy: options.featStrategy },
        destinationContext: destinationContext.value,
        outputTemplate: outputTemplate.value || undefined,
        customArgs: customArgs.value.trim() ? customArgs.value.split(/\s+/) : undefined,
        sourceTitle: analysis.value?.title,
        trackCount: analysis.value?.tracks.length
      }
    })
    commandPreview.value = res.command
  } catch {
    commandPreview.value = ''
  }
}

async function analyze() {
  if (!url.value.trim()) return
  analyzing.value = true
  analysis.value = null
  try {
    analysis.value = await $fetch('/api/downloads/analyze', {
      method: 'POST',
      body: { url: url.value.trim() }
    })
    await refreshCommandPreview()
  } catch (e: unknown) {
    const msg = e && typeof e === 'object' && 'data' in e
      ? (e as { data?: { message?: string } }).data?.message
      : 'Analyse échouée'
    showError('Erreur', msg)
  } finally {
    analyzing.value = false
  }
}

async function startDownload() {
  if (!analysis.value) return
  const selected = analysis.value.tracks.filter(t => t.selected)
  if (!selected.length) {
    toast.add({ title: 'Sélection vide', color: 'warning' })
    return
  }

  conflicts.value = await $fetch('/api/cache/check', {
    method: 'POST',
    body: { tracks: selected }
  })

  if (conflicts.value.length) {
    toast.add({
      title: 'Doublons détectés',
      description: `${conflicts.value.length} morceau(x) déjà présent(s)`,
      color: 'warning'
    })
  }

  await queueStore.enqueue({
    url: url.value,
    tracks: analysis.value.tracks,
    options: { ...options, featStrategy: options.featStrategy },
    destinationContext: destinationContext.value,
    outputTemplate: outputTemplate.value || undefined,
    customArgs: customArgs.value.trim() ? customArgs.value.split(/\s+/) : undefined,
    sourceTitle: analysis.value.title
  })

  toast.add({ title: 'Ajouté à la file', color: 'success' })
}

function toggleTrack(track: DownloadTrackItem) {
  track.selected = !track.selected
}

function toggleAll(selected: boolean) {
  analysis.value?.tracks.forEach(t => { t.selected = selected })
}

function openEdit(track: DownloadTrackItem) {
  editingTrack.value = track
  editOpen.value = true
}

function saveEdit() {
  editOpen.value = false
  editingTrack.value = null
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-col sm:flex-row sm:items-start gap-4 justify-between">
      <div class="flex-1 min-w-0">
        <DownloadUrlInput v-model="url" :loading="analyzing" @analyze="analyze" />
      </div>
      <UButton
        v-if="analysis"
        label="Télécharger la sélection"
        icon="i-lucide-download"
        color="primary"
        class="shrink-0"
        @click="startDownload"
      />
    </div>

    <UAlert
      v-if="destinationContext.type !== 'root'"
      color="primary"
      variant="subtle"
      :title="`Destination : ${contextLabel}`"
      icon="i-lucide-folder"
    />

    <div class="flex flex-col lg:flex-row gap-6">
      <div class="flex-1 space-y-4 min-w-0">
        <DownloadTrackList
          v-if="analysis"
          :tracks="displayTracks"
          :source-quality="analysis.sourceQuality"
          :job-progress="activeJob?.progress"
          @toggle="toggleTrack"
          @toggle-all="toggleAll"
          @edit="openEdit"
        />

        <DownloadQueueBar />

        <UCollapsible v-model:open="historyOpen">
          <UButton
            variant="ghost"
            color="neutral"
            :label="`Historique (${queueStore.history.length})`"
            trailing-icon="i-lucide-chevron-down"
            block
            class="justify-between"
          />
          <template #content>
            <div v-if="queueStore.history.length" class="space-y-2 mt-2">
              <div
                v-for="job in queueStore.history"
                :key="job.id"
                class="flex items-center justify-between gap-2 p-2 rounded-lg border border-default text-sm"
              >
                <span class="truncate flex-1">{{ job.url }}</span>
                <UBadge :label="job.status" size="xs" />
                <UButton size="xs" variant="ghost" icon="i-lucide-x" @click="queueStore.dismiss(job.id)" />
              </div>
            </div>
            <p v-else class="text-sm text-muted py-2">Aucun historique</p>
          </template>
        </UCollapsible>
      </div>

      <aside class="w-full lg:w-80 xl:w-96 shrink-0">
        <DownloadOptionsPanel
          v-model="options"
          v-model:custom-args="customArgs"
          v-model:output-template="outputTemplate"
          :analysis="analysis"
          :command-preview="commandPreview"
          :supported-formats="settings?.supportedFormats"
          :settings="settings"
          :destination-context="destinationContext"
          :luz-playlist-name="contextPlaylist?.name"
        />
      </aside>
    </div>

    <USlideover v-model:open="editOpen" title="Éditer les métadonnées">
      <template #body>
        <SharedMetadataEditor
          v-if="editingTrack"
          v-model="editingTrack.metadata.library"
        />
      </template>
      <template #footer>
        <UButton label="Appliquer" @click="saveEdit" />
      </template>
    </USlideover>
  </div>
</template>
