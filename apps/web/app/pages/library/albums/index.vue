<script setup lang="ts">
import { albumListQuerySchema, type AlbumSummary } from '@luz/core';
import type { TableColumn } from '@nuxt/ui';

const { query } = useListQuery(albumListQuerySchema);
const { data } = await useFetch('/api/library/albums', { query });
const { sorting, sortable } = useSortableHeaders<AlbumSummary>(query);

const sortOptions = [
	{ label: 'Title', value: 'title' },
	{ label: 'Artist', value: 'artist' },
	{ label: 'Year', value: 'year' },
] as const;

const columns: TableColumn<AlbumSummary>[] = [
	{ id: 'title', ...sortable('Album') },
	{ id: 'artist', ...sortable('Artist') },
	{ id: 'year', ...sortable('Year') },
	{
		id: 'quality',
		header: 'Quality',
		// Hidden on narrow screens like the track count; the album page still shows it
		meta: { class: { th: 'hidden sm:table-cell', td: 'hidden sm:table-cell' } },
	},
	{
		id: 'tracks',
		header: 'Tracks',
		meta: {
			class: {
				th: 'hidden text-end sm:table-cell',
				td: 'hidden text-end tabular-nums sm:table-cell',
			},
		},
	},
];
</script>

<template>
	<LibraryEmpty v-if="data?.total === 0" />
	<LibraryList
		v-else-if="data"
		:count="plural(data.total, 'album')"
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
			caption="Albums"
		>
			<template #title-cell="{ row }">
				<div class="flex items-center gap-3">
					<AlbumCover
						:album="row.original.title"
						:artist="row.original.artist.name"
						class="size-8"
					/>
					<ULink :to="`/library/albums/${row.original.id}`" class="font-medium">
						{{ albumTitle(row.original.title) }}
					</ULink>
				</div>
			</template>
			<template #artist-cell="{ row }">
				<ULink :to="`/library/artists/${row.original.artist.id}`">
					{{ artistName(row.original.artist.name) }}
				</ULink>
			</template>
			<template #year-cell="{ row }">{{ row.original.year ?? '' }}</template>
			<template #quality-cell="{ row }">
				<AlbumQualityBadge :quality="row.original.quality" />
			</template>
			<template #tracks-cell="{ row }">{{ row.original.trackCount }}</template>
		</UTable>
	</LibraryList>
</template>
