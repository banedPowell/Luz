<script setup lang="ts">
import { formatDuration, trackListQuerySchema, type TrackSummary } from '@luz/core';
import type { TableColumn } from '@nuxt/ui';

const { query } = useListQuery(trackListQuerySchema);
const { data } = await useFetch('/api/library/tracks', { query });

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
	{ id: 'title', header: 'Title' },
	{ id: 'artist', header: 'Artist' },
	{ id: 'album', header: 'Album' },
	{ id: 'year', header: 'Year', meta: { class: { th: wide, td: wide } } },
	{
		id: 'duration',
		header: 'Duration',
		meta: { class: { th: `${wide} text-end`, td: `${wide} text-end tabular-nums` } },
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
		<UTable :data="data.items" :columns="columns" caption="Tracks">
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
		</UTable>
	</LibraryList>
</template>
