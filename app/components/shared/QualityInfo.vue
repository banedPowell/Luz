<script setup lang="ts">
import type { QualityInfo } from '#shared/domain/download'

defineProps<{
  source?: QualityInfo
  output?: QualityInfo
}>()
</script>

<template>
  <div class="flex flex-wrap gap-2">
    <UBadge v-if="source" color="neutral" variant="subtle">
      Source: {{ source.label }}
    </UBadge>
    <UBadge v-if="output" color="primary" variant="subtle">
      Sortie: {{ output.label }}
    </UBadge>
  </div>
</template>
