<script setup lang="ts">
import { formatDuration, trackListQuerySchema, type TrackSummary } from '@luz/core';
import type { TableColumn } from '@nuxt/ui';
import { h } from 'vue';

const { query } = useListQuery(trackListQuerySchema);
const { data } = await useFetch('/api/library/tracks', { query });
const { sorting, sortable } = useSortableHeaders<TrackSummary>(query);

const sortOptions = [
	{ label: 'Title', value: 'title' },
	{ label: 'Artist', value: 'artist' },
	{ label: 'Album', value: 'album' },
	{ label: 'Year', value: 'year' },
	{ label: 'Duration', value: 'duration' },
] as const;

// Narrow screens keep the title, artist and album
const wide = 'hidden md:table-cell';

const columns: TableColumn<TrackSummary>[] = [
	{ id: 'title', ...sortable('Title') },
	{ id: 'artist', ...sortable('Artist') },
	{ id: 'album', ...sortable('Album') },
	{
		id: 'year',
		...sortable('Year'),
		meta: { class: { th: wide, td: wide } },
	},
	{
		id: 'duration',
		...sortable('Duration'),
		meta: { class: { th: `${wide} text-end`, td: `${wide} text-end tabular-nums` } },
	},
	{
		id: 'actions',
		header: () => h('span', { class: 'sr-only' }, 'Actions'),
		meta: { class: { th: 'w-px px-1', td: 'w-px px-1 py-0 text-end' } },
	},
];
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
			<template #title-cell="{ row }">
				<span class="font-medium text-highlighted">{{ trackTitle(row.original) }}</span>
			</template>
			<template #artist-cell="{ row }">{{ trackArtists(row.original) }}</template>
			<template #album-cell="{ row }">
				<ULink :to="`/library/albums/${row.original.album.id}`">
					{{ albumTitle(row.original.album.title) }}
				</ULink>
			</template>
			<template #year-cell="{ row }">{{ row.original.year ?? '' }}</template>
			<template #duration-cell="{ row }">
				{{ formatDuration(row.original.durationMs) ?? '' }}
			</template>
			<template #actions-cell="{ row }">
				<TrackMenu :track="row.original" />
			</template>
		</UTable>
	</LibraryList>
</template>
