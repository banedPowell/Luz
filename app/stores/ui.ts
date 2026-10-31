import { defineStore } from 'pinia'
import { useLocalStorage } from '@vueuse/core'

export const useUiStore = defineStore('ui', () => {
  const compactMode = useLocalStorage('luz-compact', false)
  const thumbnailSize = useLocalStorage<'sm' | 'md' | 'lg'>('luz-thumb', 'md')
  const animations = useLocalStorage('luz-animations', true)
  const sidebarOpen = useLocalStorage('luz-sidebar-open', true)

  return {
    compactMode,
    thumbnailSize,
    animations,
    sidebarOpen
  }
})
