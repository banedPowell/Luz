<script setup lang="ts">
import { formatTrackLabel } from '#shared/utils/track-display'
const { data: recent } = await useAsyncData('library:recent', () => $fetch('/api/library/recent'))

const isEmpty = computed(() => {
  const r = recent.value
  if (!r) return false
  return !r.artists.length && !r.albums.length && !r.playlists.length && !r.tracks.length
})
</script>

<template>
  <div class="space-y-8">
    <UEmpty
      v-if="isEmpty"
      icon="i-lucide-music"
      title="Votre bibliothèque est vide"
      description="Commencez par télécharger de la musique depuis YouTube ou une autre source."
    >
      <UButton to="/downloads" label="Commencer un téléchargement" icon="i-lucide-download" color="primary" />
    </UEmpty>

    <template v-else>
      <section>
        <h2 class="text-2xl font-bold mb-2">Bienvenue sur Luz</h2>
        <p class="text-muted mb-6">Votre bibliothèque musicale local-first</p>
        <HomeUrlHero />
      </section>

      <HomeRecentSection
        v-if="recent?.artists?.length"
        title="Artistes récents"
        :items="recent.artists.map(a => ({
          id: a.id,
          label: a.name,
          to: `/library/artists/${a.id}`,
          type: 'artist' as const,
          entityId: a.id
        }))"
      />

      <HomeRecentSection
        v-if="recent?.albums?.length"
        title="Albums récents"
        :items="recent.albums.map(a => ({
          id: a.id,
          label: a.title,
          to: `/library/albums/${a.id}`,
          type: 'album' as const,
          entityId: a.id
        }))"
      />

      <HomeRecentSection
        v-if="recent?.playlists?.length"
        title="Playlists récentes"
        :items="recent.playlists.map(p => ({
          id: p.id,
          label: p.name,
          to: `/library/playlists/${p.id}`,
          type: 'playlist' as const
        }))"
      />

      <HomeRecentSection
        v-if="recent?.tracks?.length"
        title="Morceaux récents"
        :items="recent.tracks.map(t => ({
          id: t.id,
          label: formatTrackLabel(t),
          to: '/library/tracks',
          type: t.albumId ? 'album' as const : undefined,
          entityId: t.albumId
        }))"
      />
    </template>
  </div>
</template>
