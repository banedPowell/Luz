<script setup lang="ts">
import type { TrackSummary } from '@luz/core';

// The codec is stored under its short name (codecName), so it reads as is: FLAC, MP3, AAC.
// Nothing is drawn while it is unknown (tracks not read since codecs are stored)
defineProps<{ track: Pick<TrackSummary, 'codec'> }>();
</script>

<template>
	<span v-if="track.codec" class="shrink-0 text-xs text-muted">{{ track.codec }}</span>
</template>
