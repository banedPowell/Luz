<script setup lang="ts">
import { librarySearchQuerySchema, type SearchGroup } from '@luz/core';

const route = useRoute();
const appConfig = useAppConfig();

// A query the schema rejects (too long, repeated) reads as no query rather than an error
const query = computed(() => {
	const parsed = librarySearchQuerySchema.safeParse(route.query);
	return parsed.success ? parsed.data : { q: '' };
});
// The previous results stay on screen until the next ones arrive, rather than flashing
const { data: results } = await useFetch('/api/library/search', { query });
const found = computed(
	() =>
		results.value !== undefined &&
		results.value.tracks.total + results.value.albums.total + results.value.artists.total > 0,
);

function countOf(group: SearchGroup<unknown>, word: string): string {
	return group.items.length < group.total
		? `First ${group.items.length} of ${plural(group.total, word)}`
		: plural(group.total, word);
}
</script>

<template>
	<UEmpty
		v-if="query.q === ''"
		:icon="appConfig.ui.icons.search"
		title="Search your library"
		description="Type part of a track, album or artist name. Case and accents do not matter."
		variant="naked"
	/>
	<UEmpty
		v-else-if="results && !found"
		:icon="appConfig.ui.icons.search"
		:title="`No results for “${results.query}”`"
		description="Check the spelling, or type a shorter part of the name."
		variant="naked"
	/>
	<div v-else-if="results" class="flex flex-col gap-8">
		<section
			v-if="results.tracks.total > 0"
			class="flex flex-col gap-2"
			aria-labelledby="search-tracks"
		>
			<div class="flex items-baseline justify-between gap-3">
				<h2 id="search-tracks" class="font-semibold text-highlighted">Tracks</h2>
				<p class="text-sm text-muted">{{ countOf(results.tracks, 'track') }}</p>
			</div>
			<ul class="divide-y divide-default">
				<li
					v-for="track in results.tracks.items"
					:key="track.id"
					class="flex flex-col py-2"
				>
					<ULink :to="`/library/albums/${track.album.id}`" class="font-medium">
						{{ trackTitle(track) }}
					</ULink>
					<span class="text-sm text-muted">
						{{ trackArtists(track) }} · {{ albumTitle(track.album.title) }}
					</span>
				</li>
			</ul>
		</section>

		<section
			v-if="results.albums.total > 0"
			class="flex flex-col gap-2"
			aria-labelledby="search-albums"
		>
			<div class="flex items-baseline justify-between gap-3">
				<h2 id="search-albums" class="font-semibold text-highlighted">Albums</h2>
				<p class="text-sm text-muted">{{ countOf(results.albums, 'album') }}</p>
			</div>
			<ul class="divide-y divide-default">
				<li
					v-for="album in results.albums.items"
					:key="album.id"
					class="flex flex-col py-2"
				>
					<ULink :to="`/library/albums/${album.id}`" class="font-medium">
						{{ albumTitle(album.title) }}
					</ULink>
					<span class="text-sm text-muted">
						<ULink :to="`/library/artists/${album.artist.id}`">
							{{ artistName(album.artist.name) }}
						</ULink>
						<template v-if="album.year"> · {{ album.year }}</template>
					</span>
				</li>
			</ul>
		</section>

		<section
			v-if="results.artists.total > 0"
			class="flex flex-col gap-2"
			aria-labelledby="search-artists"
		>
			<div class="flex items-baseline justify-between gap-3">
				<h2 id="search-artists" class="font-semibold text-highlighted">Artists</h2>
				<p class="text-sm text-muted">{{ countOf(results.artists, 'artist') }}</p>
			</div>
			<ul class="divide-y divide-default">
				<li
					v-for="artist in results.artists.items"
					:key="artist.id"
					class="flex flex-col py-2"
				>
					<ULink :to="`/library/artists/${artist.id}`" class="font-medium">
						{{ artistName(artist.name) }}
					</ULink>
					<span class="text-sm text-muted">
						{{ plural(artist.albumCount, 'album') }} ·
						{{ plural(artist.trackCount, 'track') }}
					</span>
				</li>
			</ul>
		</section>
	</div>
</template>
