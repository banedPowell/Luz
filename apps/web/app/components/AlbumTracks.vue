<script setup lang="ts">
import { formatBitrate, formatDuration, type TrackSummary } from '@luz/core';
import type { TableColumn } from '@nuxt/ui';
import { h } from 'vue';

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
		// Kept on narrow screens: the format is what a file manager shows first
		id: 'format',
		header: 'Format',
	},
	{
		id: 'bitrate',
		header: 'Bitrate',
		meta: {
			class: {
				th: 'hidden text-end sm:table-cell',
				td: 'hidden text-end tabular-nums sm:table-cell',
			},
		},
	},
	{
		id: 'duration',
		header: 'Duration',
		meta: { class: { th: 'text-end', td: 'text-end tabular-nums' } },
	},
	{
		id: 'actions',
		header: () => h('span', { class: 'sr-only' }, 'Actions'),
		meta: { class: { th: 'w-px px-1', td: 'w-px px-1 py-0 text-end' } },
	},
];
</script>

<template>
	<UTable :data="tracks" :columns="columns" :caption="caption">
		<template #position-cell="{ row }">{{ position(row.original) }}</template>
		<template #title-cell="{ row }">
			<div class="flex min-w-0 flex-col">
				<span class="font-medium text-highlighted">{{ trackTitle(row.original) }}</span>
				<!-- An untitled track already shows its file name as its title -->
				<span
					v-if="row.original.title !== null"
					class="font-mono text-xs break-all text-muted"
				>
					{{ row.original.fileName }}
				</span>
			</div>
		</template>
		<template #format-cell="{ row }">{{ row.original.codec ?? '' }}</template>
		<template #bitrate-cell="{ row }">{{ formatBitrate(row.original.bitrate) ?? '' }}</template>
		<template #artist-cell="{ row }">{{ trackArtists(row.original) }}</template>
		<template #duration-cell="{ row }">
			{{ formatDuration(row.original.durationMs) ?? '' }}
		</template>
		<template #actions-cell="{ row }">
			<TrackMenu :track="row.original" />
		</template>
	</UTable>
</template>
