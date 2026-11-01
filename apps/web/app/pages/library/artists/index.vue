<script setup lang="ts">
import { artistListQuerySchema, type ArtistSummary } from '@luz/core';
import type { TableColumn } from '@nuxt/ui';

const { query } = useListQuery(artistListQuerySchema);
const { data } = await useFetch('/api/library/artists', { query });
const { sorting, sortable } = useSortableHeaders<ArtistSummary>(query);

const sortOptions = [{ label: 'Name', value: 'name' }] as const;

const count = { class: { th: 'text-end', td: 'text-end tabular-nums' } };

const columns: TableColumn<ArtistSummary>[] = [
	{ id: 'name', ...sortable('Artist') },
	{ id: 'albums', header: 'Albums', meta: count },
	{ id: 'tracks', header: 'Tracks', meta: count },
];
</script>

<template>
	<LibraryEmpty v-if="data?.total === 0" />
	<LibraryList
		v-else-if="data"
		:count="plural(data.total, 'artist')"
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
			caption="Artists"
		>
			<template #name-cell="{ row }">
				<ULink :to="`/library/artists/${row.original.id}`" class="font-medium">
					{{ artistName(row.original.name) }}
				</ULink>
			</template>
			<template #albums-cell="{ row }">{{ row.original.albumCount }}</template>
			<template #tracks-cell="{ row }">{{ row.original.trackCount }}</template>
		</UTable>
	</LibraryList>
</template>
