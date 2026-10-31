export const LIBRARY_KEYS = [
  'library:artists',
  'library:albums',
  'library:tracks',
  'library:recent',
  'playlists'
] as const

export function useLibraryData() {
  const artists = useAsyncData('library:artists', () => $fetch('/api/library/artists'))
  const albums = useAsyncData('library:albums', () => $fetch('/api/library/albums'))
  const tracks = useAsyncData('library:tracks', () => $fetch('/api/library/tracks'))
  const recent = useAsyncData('library:recent', () => $fetch('/api/library/recent'))
  const playlists = useAsyncData('playlists', () => $fetch('/api/playlists'))

  async function invalidateLibrary() {
    await refreshNuxtData([...LIBRARY_KEYS])
  }

  return { artists, albums, tracks, recent, playlists, invalidateLibrary }
}

export async function invalidateLibrary() {
  await refreshNuxtData([...LIBRARY_KEYS])
}
