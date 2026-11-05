<script setup lang="ts">
import { formatDuration, trackListQuerySchema, type TrackSummary } from '@luz/core';
import type { TableColumn } from '@nuxt/ui';
import { h } from 'vue';

const { query } = useListQuery(trackListQuerySchema);
const { data } = await useFetch('/api/library/tracks', { query });
const { sorting, sortable } = useSortableHeaders<TrackSummary>(query);
const selection = useListSelection(() => data.value?.items ?? []);

// The artist and the year have no column: the selector still sorts by them
const sortOptions = [
	{ label: 'Title', value: 'title' },
	{ label: 'Artist', value: 'artist' },
	{ label: 'Album', value: 'album' },
	{ label: 'Year', value: 'year' },
	{ label: 'Duration', value: 'duration' },
	{ label: 'Date added', value: 'added' },
] as const;

// Narrow screens keep the title, with its artist, and the album
const wide = 'hidden md:table-cell';

const columns: TableColumn<TrackSummary>[] = [
	// The checkboxes of the selection bar
	{ id: 'select', meta: { class: { th: 'w-px pe-0', td: 'w-px pe-0' } } },
	// Narrow screens show compact rows, cover then title, as the interface principles ask
	{
		id: 'number',
		header: '#',
		meta: {
			class: {
				th: 'hidden sm:table-cell',
				td: 'hidden w-12 tabular-nums text-muted sm:table-cell',
			},
		},
	},
	{ id: 'title', ...sortable('Title') },
	{
		id: 'album',
		...sortable('Album'),
		meta: { class: { th: 'hidden sm:table-cell', td: 'hidden sm:table-cell' } },
	},
	{
		id: 'duration',
		...sortable('Duration'),
		meta: { class: { th: `${wide} text-end`, td: `${wide} text-end tabular-nums` } },
	},
	{
		id: 'added',
		...sortable('Date added'),
		meta: { class: { th: wide, td: `${wide} text-muted` } },
	},
	{
		id: 'actions',
		header: () => h('span', { class: 'sr-only' }, 'Actions'),
		meta: { class: { th: 'w-px px-1', td: 'w-px px-1 py-0 text-end' } },
	},
];

// Numbered across pages, in the order of the sort
function rowNumber(index: number): number {
	return (query.value.page - 1) * query.value.pageSize + index + 1;
}
</script>

<template>
	<LibraryEmpty v-if="data?.total === 0" />
	<LibraryList
		v-else-if="data"
		:count="plural(data.total, 'track')"
		:total="data.total"
		:page="query.page"
		:page-size="query.pageSize"
		:sort="query.sort"
		:order="query.order"
		:sort-options="[...sortOptions]"
	>
		<UTable
			:data="data.items"
			:columns="columns"
			:sorting="sorting"
			:sorting-options="{ manualSorting: true }"
			caption="Tracks"
		>
			<template #select-header>
				<SelectCheckbox
					:model-value="selection.all.value"
					label="Select all tracks on this page"
					@update:model-value="selection.toggleAll"
				/>
			</template>
			<template #select-cell="{ row }">
				<SelectCheckbox
					:model-value="selection.isSelected(row.original.id)"
					:label="`Select ${trackTitle(row.original)}`"
					@update:model-value="(value) => selection.toggle(row.original.id, value)"
				/>
			</template>
			<template #number-cell="{ row }">{{ rowNumber(row.index) }}</template>
			<template #title-cell="{ row }">
				<div class="flex items-center gap-3">
					<AlbumCover
						:album="row.original.album.title"
						:artist="row.original.artist.name"
						class="size-8"
					/>
					<TrackTitle :track="row.original" />
				</div>
			</template>
			<template #album-cell="{ row }">
				<ULink
					:to="`/library/albums/${row.original.album.id}`"
					class="block max-w-64 truncate"
					:title="albumTitle(row.original.album.title)"
				>
					{{ albumTitle(row.original.album.title) }}
				</ULink>
			</template>
			<template #duration-cell="{ row }">
				{{ formatDuration(row.original.durationMs) ?? '' }}
			</template>
			<template #added-cell="{ row }">{{ formatAdded(row.original.addedAtMs) }}</template>
			<template #actions-cell="{ row }">
				<TrackMenu :track="row.original" />
			</template>
		</UTable>
		<LibrarySelectionBar :selection="selection" kind="tracks" />
	</LibraryList>
</template>
