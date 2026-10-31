<script setup lang="ts">
const props = defineProps<{
  action: string
  label: string
  confirmText?: string
}>()

const emit = defineEmits<{ confirm: [] }>()
const open = ref(false)
const loading = ref(false)

async function onConfirm() {
  loading.value = true
  try {
    emit('confirm')
    open.value = false
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <UModal v-model:open="open" :title="label">
    <UButton color="error" variant="soft" :label="label" @click="open = true" />
    <template #body>
      <p class="text-muted">
        {{ confirmText || `Confirmer : ${action} ?` }}
      </p>
    </template>
    <template #footer>
      <UButton color="neutral" variant="ghost" label="Annuler" @click="open = false" />
      <UButton color="error" :loading="loading" label="Confirmer" @click="onConfirm" />
    </template>
  </UModal>
</template>
