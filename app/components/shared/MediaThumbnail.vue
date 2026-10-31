<script setup lang="ts">
const props = withDefaults(defineProps<{
  title?: string
  subtitle?: string
  imagePath?: string
  entityId?: string
  type?: 'artist' | 'album' | 'playlist'
  /** Afficher le titre sous la vignette (désactiver sur les pages détail) */
  showCaption?: boolean
  /** Permettre l'agrandissement au clic (pages détail uniquement) */
  zoomable?: boolean
}>(), {
  showCaption: true,
  zoomable: false
})

const { settings } = useSettings()
const lightbox = useImageLightbox()

const sizeClass = computed(() => {
  const map = { sm: 'w-20', md: 'w-40', lg: 'w-60' } as const
  return map[settings.value?.thumbnailSize || 'md']
})

const src = computed(() => {
  if (props.imagePath) return props.imagePath
  if (props.entityId && props.type && props.type !== 'playlist') {
    return `/api/artwork/${props.type}/${props.entityId}`
  }
  return undefined
})

function openLightbox(event: MouseEvent) {
  if (!props.zoomable || !src.value) return
  event.preventDefault()
  event.stopPropagation()
  lightbox.show(src.value, props.title)
}
</script>

<template>
  <div :class="sizeClass">
    <div
      class="aspect-square rounded-lg bg-elevated flex items-center justify-center overflow-hidden w-full"
      :class="src && zoomable ? 'cursor-zoom-in' : ''"
      @click="openLightbox"
    >
      <img
        v-if="src"
        :src="src"
        :alt="title"
        class="size-full object-cover"
        loading="lazy"
        draggable="false"
        @error="($event.target as HTMLImageElement).style.display = 'none'"
      >
      <UIcon
        v-if="!src"
        :name="type === 'artist' ? 'i-lucide-user' : type === 'playlist' ? 'i-lucide-list-music' : 'i-lucide-disc'"
        class="size-12 text-muted"
      />
    </div>
    <p v-if="showCaption && title" class="mt-2 font-medium truncate text-sm">{{ title }}</p>
    <p v-if="showCaption && subtitle" class="text-xs text-muted truncate">{{ subtitle }}</p>
  </div>
</template>
