<script setup lang="ts">
import type { Artist, Album, Track, Playlist } from '#shared/domain'

const { data: artists } = await useFetch<Artist[]>('/api/library/artists')
const { data: albums } = await useFetch<Album[]>('/api/library/albums')
const { data: tracks } = await useFetch<Track[]>('/api/library/tracks')
const { data: playlists } = await useFetch<Playlist[]>('/api/playlists')
</script>

<template>
  <div class="space-y-8">
    <div class="flex items-center justify-between">
      <h2 class="text-2xl font-bold">Bibliothèque</h2>
      <SharedAddButton />
    </div>

    <section>
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-lg font-semibold">Artistes</h3>
        <UButton to="/library/artists" variant="ghost" size="sm" label="Voir tout" />
      </div>
      <div class="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4">
        <NuxtLink
          v-for="artist in (artists || []).slice(0, 6)"
          :key="artist.id"
          :to="`/library/artists/${artist.id}`"
          class="hover:opacity-80"
        >
          <SharedMediaThumbnail :title="artist.name" type="artist" :entity-id="artist.id" />
        </NuxtLink>
      </div>
    </section>

    <section>
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-lg font-semibold">Albums</h3>
        <UButton to="/library/albums" variant="ghost" size="sm" label="Voir tout" />
      </div>
      <div class="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4">
        <NuxtLink
          v-for="album in (albums || []).slice(0, 6)"
          :key="album.id"
          :to="`/library/albums/${album.id}`"
          class="hover:opacity-80"
        >
          <SharedMediaThumbnail :title="album.title" type="album" :entity-id="album.id" />
        </NuxtLink>
      </div>
    </section>

    <section>
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-lg font-semibold">Derniers morceaux</h3>
        <UButton to="/library/tracks" variant="ghost" size="sm" label="Voir tout" />
      </div>
      <LibraryTrackTable
        view="list"
        :tracks="(tracks || []).slice(0, 10)"
        :albums="albums || []"
        :artists="artists || []"
      />
    </section>

    <section>
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-lg font-semibold">Playlists</h3>
        <UButton to="/library/playlists" variant="ghost" size="sm" label="Voir tout" />
      </div>
      <div class="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4">
        <NuxtLink
          v-for="playlist in (playlists || []).slice(0, 6)"
          :key="playlist.id"
          :to="`/library/playlists/${playlist.id}`"
          class="hover:opacity-80"
        >
          <SharedMediaThumbnail :title="playlist.name" type="playlist" />
        </NuxtLink>
      </div>
    </section>
  </div>
</template>
