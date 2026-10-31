<script setup lang="ts">
import type { DownloadJob } from '#shared/domain/download'
import { formatMetadataLayersLabel } from '#shared/utils/track-display'

const queueStore = useDownloadQueueStore()

function trackLabel(track: DownloadJob['tracks'][number]) {
  return formatMetadataLayersLabel(track.metadata)
}

function isActive(job: DownloadJob) {
  return !['finished', 'cancelled', 'failed'].includes(job.status)
}
</script>

<template>
  <UCard v-if="queueStore.jobs.length">
    <template #header>
      <h3 class="font-semibold">File active</h3>
    </template>
    <div class="space-y-4">
      <div
        v-for="job in queueStore.jobs"
        :key="`${job.id}-${job.updatedAt}`"
        class="space-y-3"
      >
        <p class="text-sm truncate text-muted">{{ job.url }}</p>

        <div class="space-y-1">
          <div class="flex justify-between text-sm gap-2">
            <span class="font-medium">Progression globale</span>
            <span class="shrink-0 tabular-nums text-muted">{{ job.progress }}%</span>
          </div>
          <UProgress :model-value="job.progress" :max="100" class="h-2" />
        </div>

        <div
          v-if="job.tracks.filter(t => t.selected).length > 1"
          class="space-y-2 pt-1 border-t border-default"
        >
          <p class="text-xs text-muted font-medium">Morceaux</p>
          <div
            v-for="track in job.tracks.filter(t => t.selected)"
            :key="`${track.id}-${track.progress}-${track.status}`"
            class="flex items-center gap-2 text-xs"
          >
            <span class="truncate flex-1 min-w-0" :class="track.status === 'queued' ? 'text-muted' : ''">
              {{ trackLabel(track) }}
            </span>
            <span class="shrink-0 tabular-nums w-8 text-right text-muted">
              {{ track.progress > 0 || track.status === 'downloading' ? `${track.progress}%` : '—' }}
            </span>
            <UProgress
              :model-value="track.progress"
              :max="100"
              class="w-20 h-1"
              :class="track.status === 'queued' ? 'opacity-40' : ''"
            />
          </div>
        </div>

        <div class="flex justify-end">
          <UButton
            v-if="isActive(job)"
            size="xs"
            color="error"
            variant="ghost"
            label="Annuler"
            @click="queueStore.cancel(job.id)"
          />
        </div>
      </div>
    </div>
  </UCard>
</template>
