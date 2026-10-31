<script setup lang="ts">
defineProps<{
  title: string
  items: {
    id: string
    label: string
    subtitle?: string
    to: string
    type?: 'artist' | 'album' | 'playlist'
    entityId?: string
  }[]
}>()
</script>

<template>
  <section class="mb-8">
    <h2 class="text-xl font-bold mb-4">{{ title }}</h2>
    <div class="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4">
      <NuxtLink
        v-for="item in items"
        :key="item.id"
        :to="item.to"
        class="hover:opacity-80 transition-opacity min-w-0"
      >
        <SharedMediaThumbnail
          :title="item.label"
          :subtitle="item.subtitle"
          :type="item.type"
          :entity-id="item.entityId"
        />
      </NuxtLink>
    </div>
    <p v-if="!items.length" class="text-muted text-sm">Aucun élément récent</p>
  </section>
</template>
