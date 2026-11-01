<script setup lang="ts">
import { formatDuration, type TrackSummary } from '@luz/core';
import type { TableColumn } from '@nuxt/ui';

const props = defineProps<{
	tracks: TrackSummary[];
	caption: string;
}>();

// The disc only matters when an album has several
const multiDisc = computed(
	() => new Set(props.tracks.map((track) => track.discNumber ?? 1)).size > 1,
);

function position(track: TrackSummary): string {
	const number = track.trackNumber === null ? '' : String(track.trackNumber);
	return multiDisc.value ? `${track.discNumber ?? 1}.${number}` : number;
}

const columns: TableColumn<TrackSummary>[] = [
	{ id: 'position', header: '#', meta: { class: { td: 'w-12 tabular-nums text-muted' } } },
	{ id: 'title', header: 'Title' },
	{
		id: 'artist',
		header: 'Artist',
		meta: { class: { th: 'hidden sm:table-cell', td: 'hidden sm:table-cell' } },
	},
	{
		id: 'duration',
		header: 'Duration',
		meta: { class: { th: 'text-end', td: 'text-end tabular-nums' } },
	},
];
</script>

<template>
	<UTable :data="tracks" :columns="columns" :caption="caption">
		<template #position-cell="{ row }">{{ position(row.original) }}</template>
		<template #title-cell="{ row }">
			<span class="font-medium text-highlighted">{{ trackTitle(row.original) }}</span>
		</template>
		<template #artist-cell="{ row }">{{ trackArtists(row.original) }}</template>
		<template #duration-cell="{ row }">
			{{ formatDuration(row.original.durationMs) ?? '' }}
		</template>
	</UTable>
</template>
