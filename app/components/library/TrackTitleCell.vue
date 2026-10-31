<script setup lang="ts">
import type { Track } from '#shared/domain'
import type { Album } from '#shared/domain/album'
import { trackSubtitleForList } from '#shared/utils/track-display'

const props = withDefaults(defineProps<{
  track: Track
  albums?: Album[]
  contextTracks?: Track[]
  alwaysSubtitle?: boolean
}>(), {
  alwaysSubtitle: false
})

const subtitle = computed(() => {
  const list = props.contextTracks?.length ? props.contextTracks : [props.track]
  return trackSubtitleForList(props.track, list, props.albums, {
    always: props.alwaysSubtitle
  })
})
</script>

<template>
  <div class="min-w-0">
    <p class="font-medium truncate">{{ track.metadata.library.title }}</p>
    <p v-if="subtitle" class="text-xs text-muted truncate mt-0.5">{{ subtitle }}</p>
  </div>
</template>
