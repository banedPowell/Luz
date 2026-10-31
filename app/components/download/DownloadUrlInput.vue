<script setup lang="ts">
const url = defineModel<string>({ required: true })

defineProps<{
  loading?: boolean
}>()

const emit = defineEmits<{ analyze: [] }>()
</script>

<template>
  <div class="flex gap-2">
    <UInput
      v-model="url"
      placeholder="URL à analyser..."
      icon="i-lucide-link"
      size="lg"
      class="flex-1"
      @keyup.enter="emit('analyze')"
    />
    <UButton
      label="Analyser"
      icon="i-lucide-search"
      size="lg"
      :loading="loading"
      @click="emit('analyze')"
    />
  </div>
</template>
