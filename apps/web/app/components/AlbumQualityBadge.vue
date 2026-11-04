<script setup lang="ts">
import { albumQualityLabels, type AlbumQuality } from '@luz/core';

// Nothing is drawn while the quality is unknown (tracks not read since codecs are stored)
defineProps<{ quality: AlbumQuality | null }>();
</script>

<template>
	<UBadge
		v-if="quality"
		:label="albumQualityLabels[quality]"
		:color="quality === 'lossless' ? 'primary' : 'neutral'"
		:variant="quality === 'lossless' ? 'solid' : 'outline'"
		size="sm"
		class="shrink-0"
	/>
</template>
