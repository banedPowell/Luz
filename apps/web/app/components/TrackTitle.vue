<script setup lang="ts">
import type { TrackSummary } from '@luz/core';

const props = defineProps<{
	track: Pick<TrackSummary, 'title' | 'fileName' | 'artists' | 'artist'>;
}>();

const title = computed(() => trackTitle(props.track));
const artists = computed(() => trackArtists(props.track));
</script>

<template>
	<!-- Capped so the other columns keep their place; a hover shows what the cap cuts off -->
	<div class="flex max-w-40 min-w-0 flex-col sm:max-w-64 lg:max-w-80">
		<span class="truncate font-medium text-highlighted" :title="title">{{ title }}</span>
		<span class="truncate text-sm text-muted" :title="artists">{{ artists }}</span>
	</div>
</template>
