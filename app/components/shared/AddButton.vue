<script setup lang="ts">
const props = defineProps<{
  to?: string
  label?: string
}>()

const route = useRoute()

const contextQuery = computed(() => {
  if (route.path.startsWith('/library/artists/')) {
    return { context: 'artist', artistId: route.params.artistId as string }
  }
  if (route.path.startsWith('/library/albums/')) {
    return { context: 'album', albumId: route.params.albumId as string }
  }
  if (route.path.startsWith('/library/playlists/')) {
    return { context: 'playlist', playlistId: route.params.playlistId as string }
  }
  return null
})

const { data: contextArtist } = await useFetch(
  () => contextQuery.value?.artistId
    ? `/api/library/artists/${contextQuery.value.artistId}`
    : null
)
const { data: contextAlbum } = await useFetch(
  () => contextQuery.value?.albumId
    ? `/api/library/albums/${contextQuery.value.albumId}`
    : null
)
const { data: contextPlaylist } = await useFetch(
  () => contextQuery.value?.playlistId
    ? `/api/playlists/${contextQuery.value.playlistId}`
    : null
)

const buttonLabel = computed(() => {
  if (props.label) return props.label
  if (contextAlbum.value) return `Ajouter à ${contextAlbum.value.title}`
  if (contextArtist.value) return `Ajouter à ${contextArtist.value.name}`
  if (contextPlaylist.value) return `Ajouter à ${contextPlaylist.value.name}`
  return 'Ajouter'
})

const href = computed(() => {
  if (props.to) return props.to
  if (contextQuery.value) {
    const q = new URLSearchParams(contextQuery.value as Record<string, string>)
    return `/downloads?${q.toString()}`
  }
  return '/downloads'
})
</script>

<template>
  <UButton
    :to="href"
    icon="i-lucide-plus"
    :label="buttonLabel"
    color="primary"
    variant="soft"
  />
</template>
