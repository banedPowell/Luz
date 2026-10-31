<script setup lang="ts">
import type { DownloadTrackItem, QualityInfo } from '#shared/domain/download'
import type { Track } from '#shared/domain/track'
import { trackSubtitleForList } from '#shared/utils/track-display'

defineProps<{
  tracks: DownloadTrackItem[]
  sourceQuality?: QualityInfo
  /** Progression globale du job en cours (playlist). */
  jobProgress?: number
}>()

const emit = defineEmits<{
  toggle: [track: DownloadTrackItem]
  toggleAll: [selected: boolean]
  edit: [track: DownloadTrackItem]
}>()

function asTrack(item: DownloadTrackItem): Track {
  return {
    id: item.id,
    artistId: '',
    playlistIds: [],
    file: { path: '', size: 0, codec: '', format: '' },
    metadata: item.metadata,
    createdAt: '',
    updatedAt: ''
  }
}

function trackSubtitle(item: DownloadTrackItem, all: DownloadTrackItem[]) {
  return trackSubtitleForList(asTrack(item), all.map(asTrack))
}
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between gap-2">
        <h3 class="font-semibold">Morceaux détectés ({{ tracks.length }})</h3>
        <div class="flex gap-2">
          <UButton size="xs" variant="ghost" label="Tout" @click="emit('toggleAll', true)" />
          <UButton size="xs" variant="ghost" label="Aucun" @click="emit('toggleAll', false)" />
        </div>
      </div>
      <SharedQualityInfo v-if="sourceQuality" :source="sourceQuality" class="mt-2" />
      <div v-if="jobProgress != null && jobProgress > 0" class="mt-3 space-y-1">
        <div class="flex justify-between text-xs text-muted">
          <span>Progression playlist</span>
          <span class="tabular-nums">{{ jobProgress }}%</span>
        </div>
        <UProgress :model-value="jobProgress" class="h-1.5" />
      </div>
    </template>

    <div class="divide-y divide-default">
      <div
        v-for="track in tracks"
        :key="track.id"
        class="flex items-start gap-3 py-3 first:pt-0 last:pb-0"
      >
        <UCheckbox
          :model-value="track.selected"
          @update:model-value="emit('toggle', track)"
        />
        <div class="flex-1 min-w-0">
          <p class="font-medium truncate">{{ track.metadata.library.title }}</p>
          <p class="text-sm text-muted truncate">
            {{ trackSubtitle(track, tracks) || track.metadata.file.artist || track.metadata.library.artist }}
          </p>
          <SharedQualityInfo
            v-if="track.sourceQuality"
            :source="track.sourceQuality"
            class="mt-1"
          />
          <UProgress
            v-if="track.selected && (track.status === 'downloading' || track.progress > 0)"
            :model-value="track.progress"
            class="mt-2 h-1"
          />
        </div>
        <UButton
          size="xs"
          variant="ghost"
          icon="i-lucide-pencil"
          aria-label="Éditer métadonnées"
          @click="emit('edit', track)"
        />
      </div>
    </div>
  </UCard>
</template>
