<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'

const route = useRoute()
const uiStore = useUiStore()
const queueStore = useDownloadQueueStore()

const sidebarOpen = computed({
  get: () => uiStore.sidebarOpen,
  set: (v) => { uiStore.sidebarOpen = v }
})

const pageTitle = computed(() => {
  const titles: Record<string, string> = {
    '/': 'Accueil',
    '/downloads': 'Downloads',
    '/library': 'Bibliothèque',
    '/library/artists': 'Artistes',
    '/library/albums': 'Albums',
    '/library/tracks': 'Morceaux',
    '/library/playlists': 'Playlists',
    '/settings': 'Paramètres',
    '/settings/system': 'État du système'
  }
  if (titles[route.path]) return titles[route.path]
  if (route.path.startsWith('/library/artists/')) return 'Artiste'
  if (route.path.startsWith('/library/albums/')) return 'Album'
  if (route.path.startsWith('/library/playlists/')) return 'Playlist'
  return 'Luz'
})

const navItems = computed<NavigationMenuItem[]>(() => [
  { label: 'Accueil', icon: 'i-lucide-house', to: '/', active: route.path === '/' },
  {
    label: 'Downloads',
    icon: 'i-lucide-download',
    to: '/downloads',
    active: route.path === '/downloads',
    badge: queueStore.activeCount > 0 ? String(queueStore.activeCount) : undefined
  },
  {
    label: 'Bibliothèque',
    icon: 'i-lucide-library',
    to: '/library',
    active: route.path === '/library',
    defaultOpen: route.path.startsWith('/library'),
    children: [
      { label: 'Vue d\'ensemble', icon: 'i-lucide-layout-grid', to: '/library', active: route.path === '/library' },
      { label: 'Artistes', icon: 'i-lucide-mic', to: '/library/artists', active: route.path.startsWith('/library/artists') },
      { label: 'Albums', icon: 'i-lucide-disc', to: '/library/albums', active: route.path.startsWith('/library/albums') },
      { label: 'Morceaux', icon: 'i-lucide-music', to: '/library/tracks', active: route.path === '/library/tracks' },
      { label: 'Playlists', icon: 'i-lucide-list-music', to: '/library/playlists', active: route.path.startsWith('/library/playlists') }
    ]
  },
  { label: 'Paramètres', icon: 'i-lucide-settings', to: '/settings', active: route.path.startsWith('/settings') }
])

onMounted(() => {
  queueStore.connect()
  queueStore.refresh()
})

onUnmounted(() => {
  queueStore.disconnect()
})
</script>

<template>
  <div class="flex flex-1 min-h-svh bg-neutral-50 dark:bg-neutral-950">
    <USidebar
      v-model:open="sidebarOpen"
      variant="inset"
      collapsible="icon"
      rail
      :ui="{ container: 'h-full' }"
    >
      <template #header>
        <div class="flex items-center justify-center gap-2 px-1 group-data-[state=collapsed]:justify-center">
          <UIcon name="i-lucide-disc-3" class="size-6 text-primary shrink-0" />
          <span class="font-bold text-lg truncate group-data-[state=collapsed]:hidden group-data-[collapsible=icon]:hidden">Luz</span>
        </div>
      </template>

      <template #default="{ state }">
        <UNavigationMenu
          :key="state"
          :items="navItems"
          orientation="vertical"
          :ui="{ link: 'p-1.5 overflow-hidden' }"
        />
      </template>

      <template #footer>
        <div class="px-1 text-xs text-muted truncate">
          Luz
        </div>
      </template>
    </USidebar>

    <div class="flex-1 flex flex-col overflow-hidden lg:peer-data-[variant=inset]:m-4 lg:peer-data-[variant=inset]:not-peer-data-[collapsible=offcanvas]:ms-0 peer-data-[variant=inset]:rounded-xl peer-data-[variant=inset]:shadow-sm peer-data-[variant=inset]:ring peer-data-[variant=inset]:ring-default bg-default">
      <header class="h-(--ui-header-height) shrink-0 flex items-center gap-3 px-4 border-b border-default">
        <UButton
          icon="i-lucide-panel-left"
          color="neutral"
          variant="ghost"
          aria-label="Toggle sidebar"
          @click="sidebarOpen = !sidebarOpen"
        />
        <h1 class="font-semibold text-lg truncate flex-1">
          {{ pageTitle }}
        </h1>
        <UBadge
          v-if="queueStore.activeCount > 0"
          color="primary"
          variant="subtle"
          :label="`${queueStore.activeCount} téléchargement(s)`"
        />
      </header>
      <main class="flex-1 overflow-auto p-4 md:p-6">
        <NuxtPage />
      </main>
    </div>
    <SharedImageLightbox />
  </div>
</template>
