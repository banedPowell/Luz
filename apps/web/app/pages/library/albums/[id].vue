<script setup lang="ts">
// Any other id is a 404 without asking the server
definePageMeta({ validate: (route) => /^[1-9]\d*$/.test(String(route.params.id)) });

const route = useRoute();
const { data, error } = await useFetch(`/api/library/albums/${String(route.params.id)}`);
if (error.value) {
	throw createError({ statusCode: error.value.statusCode ?? 500, fatal: true });
}
</script>

<template>
	<section v-if="data" class="flex flex-col gap-4" aria-labelledby="album-title">
		<div class="flex flex-col gap-1">
			<h2 id="album-title" class="text-xl font-semibold text-highlighted">
				{{ albumTitle(data.title) }}
			</h2>
			<p class="text-sm text-muted">
				<ULink :to="`/library/artists/${data.artist.id}`">
					{{ artistName(data.artist.name) }}
				</ULink>
				<template v-if="data.year"> · {{ data.year }}</template>
				· {{ plural(data.trackCount, 'track') }}
			</p>
		</div>
		<AlbumTracks :tracks="data.tracks" :caption="`Tracks of ${albumTitle(data.title)}`" />
	</section>
</template>
