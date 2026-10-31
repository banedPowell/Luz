<script setup lang="ts">
import type { TrackMetadata } from '#shared/domain/track'

const model = defineModel<TrackMetadata>({ required: true })
</script>

<template>
  <div class="grid gap-3 sm:grid-cols-2">
    <UFormField label="Artiste">
      <UInput v-model="model.artist" />
    </UFormField>
    <UFormField label="Album">
      <UInput v-model="model.album" />
    </UFormField>
    <UFormField label="Titre" class="sm:col-span-2">
      <UInput v-model="model.title" />
    </UFormField>
    <UFormField label="N° piste (fichier)">
      <UInput v-model.number="model.trackNumber" type="number" />
    </UFormField>
    <UFormField label="Année">
      <UInput v-model.number="model.year" type="number" />
    </UFormField>
    <UFormField label="Genre">
      <UInput v-model="model.genre" />
    </UFormField>
    <UFormField label="Commentaire" class="sm:col-span-2">
      <UTextarea v-model="model.comment" :rows="2" />
    </UFormField>
  </div>
</template>
