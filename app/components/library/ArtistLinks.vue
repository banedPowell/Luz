<script setup lang="ts">
import type { Artist } from '#shared/domain'

defineProps<{
  primary?: string
  primaryId?: string
  /** Autres artistes (métadonnées fichier, feats, etc.) */
  collaborators?: string[]
  /** @deprecated utiliser collaborators */
  feats?: string[]
  artists?: Artist[]
  muted?: boolean
  /** Afficher uniquement les collaborateurs */
  collaboratorsOnly?: boolean
  /** @deprecated */
  featsOnly?: boolean
}>()

function artistId(name: string, artists?: Artist[]) {
  return resolveArtistByName(name, artists)?.id
}
</script>

<template>
  <span
    class="inline-flex flex-wrap items-center gap-x-1 gap-y-0.5"
    :class="muted ? 'text-muted' : ''"
  >
    <template v-if="!collaboratorsOnly && !featsOnly && primary">
      <NuxtLink
        v-if="primaryId"
        :to="`/library/artists/${primaryId}`"
        class="hover:text-primary hover:underline truncate"
      >
        {{ primary }}
      </NuxtLink>
      <span v-else class="truncate">{{ primary }}</span>
    </template>

    <template v-if="(collaborators?.length || feats?.length)">
      <span v-if="!collaboratorsOnly && !featsOnly && primary" class="text-muted shrink-0">·</span>
      <template v-for="(name, i) in (collaborators || feats)" :key="name">
        <NuxtLink
          v-if="artistId(name, artists)"
          :to="`/library/artists/${artistId(name, artists)}`"
          class="hover:text-primary hover:underline truncate"
        >
          {{ name }}
        </NuxtLink>
        <span v-else class="truncate">{{ name }}</span>
        <span v-if="i < (collaborators || feats)!.length - 1" class="text-muted">,</span>
      </template>
    </template>
  </span>
</template>
