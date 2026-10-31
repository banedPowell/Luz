<script setup lang="ts">
const { open, src, alt, close } = useImageLightbox()

watch(open, (isOpen) => {
  if (import.meta.client) {
    document.body.style.overflow = isOpen ? 'hidden' : ''
  }
})

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && open.value) close()
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  if (import.meta.client) document.body.style.overflow = ''
})
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-opacity duration-200"
      leave-active-class="transition-opacity duration-150"
      enter-from-class="opacity-0"
      leave-to-class="opacity-0"
    >
      <div
        v-if="open"
        class="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 p-4 md:p-8 cursor-zoom-out"
        role="dialog"
        aria-modal="true"
        :aria-label="alt || 'Image agrandie'"
        @click="close"
      >
        <img
          :src="src"
          :alt="alt"
          class="max-h-[92vh] max-w-[92vw] object-contain rounded-lg shadow-2xl cursor-default select-none"
          @click.stop
        >
      </div>
    </Transition>
  </Teleport>
</template>
