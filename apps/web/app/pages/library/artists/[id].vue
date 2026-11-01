<script setup lang="ts">
// Any other id is a 404 without asking the server
definePageMeta({ validate: (route) => /^[1-9]\d*$/.test(String(route.params.id)) });

const route = useRoute();
const { data, error } = await useFetch(`/api/library/artists/${String(route.params.id)}`);
if (error.value) {
	throw createError({ statusCode: error.value.statusCode ?? 500, fatal: true });
}
</script>

<template>
	<section v-if="data" class="flex flex-col gap-6" aria-labelledby="artist-name">
		<div class="flex flex-col gap-1">
			<h2 id="artist-name" class="text-xl font-semibold text-highlighted">
				{{ artistName(data.name) }}
			</h2>
			<p class="text-sm text-muted">
				{{ plural(data.albumCount, 'album') }} · {{ plural(data.trackCount, 'track') }}
			</p>
		</div>
		<section
			v-for="album in data.albums"
			:key="album.id"
			class="flex flex-col gap-2"
			:aria-labelledby="`album-${album.id}`"
		>
			<h3 :id="`album-${album.id}`" class="font-semibold text-highlighted">
				<ULink :to="`/library/albums/${album.id}`">{{ albumTitle(album.title) }}</ULink>
				<span v-if="album.year" class="font-normal text-muted"> · {{ album.year }}</span>
			</h3>
			<AlbumTracks :tracks="album.tracks" :caption="`Tracks of ${albumTitle(album.title)}`" />
		</section>
	</section>
</template>
