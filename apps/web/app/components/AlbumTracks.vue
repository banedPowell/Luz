<script setup lang="ts">
import { formatDuration, type TrackSummary } from '@luz/core';
import type { TableColumn } from '@nuxt/ui';
import { h } from 'vue';
import type { ListSelection } from '~/composables/useListSelection';

const props = defineProps<{
	tracks: TrackSummary[];
	caption: string;
	// Shared by the tables of a page that has several, which then draws the bar itself:
	// one fixed bar per table would stack them on the same spot
	selection?: ListSelection;
}>();

// The disc only matters when an album has several
const multiDisc = computed(
	() => new Set(props.tracks.map((track) => track.discNumber ?? 1)).size > 1,
);

function position(track: TrackSummary): string {
	const number = track.trackNumber === null ? '' : String(track.trackNumber);
	return multiDisc.value ? `${track.discNumber ?? 1}.${number}` : number;
}

// A table keeps the selection it starts with: a page never swaps it
const shared = props.selection;
const selection = shared ?? useListSelection(() => props.tracks);

const columns: TableColumn<TrackSummary>[] = [
	// The checkboxes of the selection bar
	{ id: 'select', meta: { class: { th: 'w-px pe-0', td: 'w-px pe-0' } } },
	{ id: 'position', header: '#', meta: { class: { td: 'w-12 tabular-nums text-muted' } } },
	// The artist sits under the title; the album is the page itself
	{ id: 'title', header: 'Title' },
	{
		id: 'duration',
		header: 'Duration',
		meta: {
			class: {
				th: 'hidden text-end sm:table-cell',
				td: 'hidden text-end tabular-nums sm:table-cell',
			},
		},
	},
	{
		id: 'added',
		header: 'Date added',
		meta: { class: { th: 'hidden md:table-cell', td: 'hidden md:table-cell text-muted' } },
	},
	{
		id: 'actions',
		header: () => h('span', { class: 'sr-only' }, 'Actions'),
		meta: { class: { th: 'w-px px-1', td: 'w-px px-1 py-0 text-end' } },
	},
];
</script>

<template>
	<div class="flex flex-col gap-2">
		<UTable :data="tracks" :columns="columns" :caption="caption">
			<template #select-header>
				<SelectCheckbox
					:model-value="selection.allOf(tracks)"
					:label="`Select all ${caption.charAt(0).toLowerCase()}${caption.slice(1)}`"
					@update:model-value="(value) => selection.toggleAllOf(tracks, value)"
				/>
			</template>
			<template #select-cell="{ row }">
				<SelectCheckbox
					:model-value="selection.isSelected(row.original.id)"
					:label="`Select ${trackTitle(row.original)}`"
					@update:model-value="(value) => selection.toggle(row.original.id, value)"
				/>
			</template>
			<template #position-cell="{ row }">{{ position(row.original) }}</template>
			<template #title-cell="{ row }"><TrackTitle :track="row.original" /></template>
			<template #duration-cell="{ row }">
				{{ formatDuration(row.original.durationMs) ?? '' }}
			</template>
			<template #added-cell="{ row }">{{ formatAdded(row.original.addedAtMs) }}</template>
			<template #actions-cell="{ row }">
				<TrackMenu :track="row.original" />
			</template>
		</UTable>
		<LibrarySelectionBar v-if="!shared" :selection="selection" kind="tracks" />
	</div>
</template>
