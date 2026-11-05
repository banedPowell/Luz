<script setup lang="ts">
import { albumListQuerySchema, type AlbumSummary } from '@luz/core';
import type { TableColumn } from '@nuxt/ui';

const { query } = useListQuery(albumListQuerySchema);
const { data } = await useFetch('/api/library/albums', { query });
const { sorting, sortable } = useSortableHeaders<AlbumSummary>(query);
const { view } = useListView();

const sortOptions = [
	{ label: 'Title', value: 'title' },
	{ label: 'Artist', value: 'artist' },
	{ label: 'Year', value: 'year' },
] as const;

const columns: TableColumn<AlbumSummary>[] = [
	// max-w-0 lets the title and artist cells shrink to the room the other columns leave,
	// truncated, instead of stretching the table past the screen; the widths share that room
	{
		id: 'title',
		...sortable('Album'),
		meta: { class: { td: 'w-full max-w-0 sm:w-3/5' } },
	},
	{
		id: 'artist',
		...sortable('Artist'),
		// On narrow screens the artist moves under the title, so the row fits without scrolling
		meta: { class: { th: 'hidden sm:table-cell', td: 'hidden w-2/5 max-w-0 sm:table-cell' } },
	},
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
		view-switch
	>
		<!-- The sort selector replaces the column headers here -->
		<ul
			v-if="view === 'grid'"
			aria-label="Albums"
			class="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"
		>
			<li v-for="album in data.items" :key="album.id" class="flex min-w-0 flex-col gap-2">
				<!-- The cover repeats the title link for the pointer; the keyboard stops on the title only -->
				<NuxtLink
					:to="`/library/albums/${album.id}`"
					tabindex="-1"
					aria-hidden="true"
					class="block rounded-sm transition-opacity hover:opacity-80"
				>
					<AlbumCover :album="album.title" :artist="album.artist.name" class="w-full" />
				</NuxtLink>
				<div class="flex min-w-0 flex-col">
					<ULink
						:to="`/library/albums/${album.id}`"
						:title="albumTitle(album.title)"
						class="truncate font-medium"
					>
						{{ albumTitle(album.title) }}
					</ULink>
					<ULink
						:to="`/library/artists/${album.artist.id}`"
						:title="artistName(album.artist.name)"
						class="truncate text-sm text-muted"
					>
						{{ artistName(album.artist.name) }}
					</ULink>
				</div>
				<AlbumQualityBadge :quality="album.quality" class="self-start" />
			</li>
		</ul>
		<UTable
			v-else
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
						class="size-8 shrink-0"
					/>
					<!-- Truncated like TrackTitle; a hover shows what the cell cuts off -->
					<div class="flex min-w-0 flex-col">
						<ULink
							:to="`/library/albums/${row.original.id}`"
							:title="albumTitle(row.original.title)"
							class="truncate font-medium"
						>
							{{ albumTitle(row.original.title) }}
						</ULink>
						<ULink
							:to="`/library/artists/${row.original.artist.id}`"
							:title="artistName(row.original.artist.name)"
							class="truncate text-sm text-muted sm:hidden"
						>
							{{ artistName(row.original.artist.name) }}
						</ULink>
					</div>
				</div>
			</template>
			<template #artist-cell="{ row }">
				<ULink
					:to="`/library/artists/${row.original.artist.id}`"
					:title="artistName(row.original.artist.name)"
					class="block truncate"
				>
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
