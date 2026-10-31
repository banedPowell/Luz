<script setup lang="ts">
defineProps<{
  title: string
  albumId?: string
  muted?: boolean
}>()
</script>

<template>
  <NuxtLink
    v-if="albumId"
    :to="`/library/albums/${albumId}`"
    class="hover:text-primary hover:underline truncate"
    :class="muted ? 'text-muted' : ''"
  >
    {{ title }}
  </NuxtLink>
  <span v-else class="truncate" :class="muted ? 'text-muted' : ''">{{ title }}</span>
</template>
