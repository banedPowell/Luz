<script setup lang="ts">
const url = ref('')
const router = useRouter()

function submit() {
  if (!url.value.trim()) return
  router.push({ path: '/downloads', query: { url: url.value.trim() } })
}
</script>

<template>
  <div class="flex flex-col sm:flex-row gap-3 max-w-2xl">
    <UInput
      v-model="url"
      placeholder="Collez une URL YouTube, playlist..."
      icon="i-lucide-link"
      size="lg"
      class="flex-1"
      @keyup.enter="submit"
    />
    <UButton
      label="Télécharger"
      icon="i-lucide-download"
      size="lg"
      color="primary"
      @click="submit"
    />
  </div>
</template>
