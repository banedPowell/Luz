const open = ref(false)
const src = ref('')
const alt = ref('')

export function useImageLightbox() {
  function show(imageSrc: string, imageAlt = '') {
    src.value = imageSrc
    alt.value = imageAlt
    open.value = true
  }

  function close() {
    open.value = false
  }

  return {
    open: readonly(open),
    src: readonly(src),
    alt: readonly(alt),
    show,
    close
  }
}
