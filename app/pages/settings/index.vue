<script setup lang="ts">
import { useDebounceFn } from '@vueuse/core'
import type { AppSettings } from '#shared/domain'

const { settings, update } = useSettings()
const { status, refresh: refreshStatus, pending: statusPending, runAction } = useSystemStatus()
const { showError } = useAppToast()
const toast = useToast()

const tab = ref('general')
const exporting = ref(false)
const importing = ref(false)
const importInput = ref<HTMLInputElement | null>(null)

const tabItems = [
  { label: 'Général', value: 'general', slot: 'general' as const },
  { label: 'Téléchargement', value: 'download', slot: 'download' as const },
  { label: 'Cache', value: 'cache', slot: 'cache' as const },
  { label: 'Système', value: 'system', slot: 'system' as const },
  { label: 'Danger', value: 'danger', slot: 'danger' as const }
]

const textDraft = reactive({
  libraryPath: '',
  appDataPath: '',
  outputTemplate: '',
  playlistOutputTemplate: ''
})
const textDirty = ref(false)

watch(settings, (s) => {
  if (!s || textDirty.value) return
  textDraft.libraryPath = s.libraryPath
  textDraft.appDataPath = s.appDataPath || ''
  textDraft.outputTemplate = s.outputTemplate
  textDraft.playlistOutputTemplate = s.playlistOutputTemplate || ''
}, { immediate: true })

async function saveSettings(partial: Partial<AppSettings>, opts?: { silent?: boolean, toast?: boolean }) {
  await update(partial, { silent: opts?.silent })
  if (opts?.toast) {
    toast.add({ title: 'Paramètres sauvegardés', color: 'success' })
  }
}

function saveInstant(partial: Partial<AppSettings>) {
  saveSettings(partial)
}

const debouncedSaveText = useDebounceFn((partial: Partial<AppSettings>) => {
  saveSettings(partial, { silent: true })
}, 600)

function onTextInput(partial: Partial<AppSettings>) {
  textDirty.value = true
  debouncedSaveText(partial)
}

function saveTextOnBlur(partial: Partial<AppSettings>) {
  debouncedSaveText.cancel()
  textDirty.value = false
  saveSettings(partial, { toast: true })
}

async function dangerAction(action: string, label: string) {
  const result = await runAction(action) as { message: string }
  await invalidateLibrary()
  toast.add({ title: label, description: result.message, color: 'success' })
}

async function exportData() {
  exporting.value = true
  try {
    const blob = await $fetch<Blob>('/api/system/export', { method: 'POST', responseType: 'blob' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `luz-backup-${Date.now()}.zip`
    a.click()
    URL.revokeObjectURL(url)
    toast.add({ title: 'Export terminé', color: 'success' })
  } catch {
    showError('Export échoué')
  } finally {
    exporting.value = false
  }
}

async function onImportFile(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  importing.value = true
  try {
    const form = new FormData()
    form.append('file', file)
    await $fetch('/api/system/import', { method: 'POST', body: form })
    toast.add({ title: 'Import terminé', color: 'success' })
    await invalidateLibrary()
  } catch {
    showError('Import échoué')
  } finally {
    importing.value = false
    input.value = ''
  }
}
</script>

<template>
  <div class="max-w-3xl space-y-6">
    <UTabs v-model="tab" :items="tabItems" :content="false" />

    <div v-if="tab === 'general' && settings" class="space-y-4">
      <UFormField label="Thème">
        <USelect
          :model-value="settings.theme"
          :items="[
            { label: 'Système', value: 'system' },
            { label: 'Clair', value: 'light' },
            { label: 'Sombre', value: 'dark' }
          ]"
          @update:model-value="saveInstant({ theme: $event as AppSettings['theme'] })"
        />
      </UFormField>
      <UFormField label="Taille des vignettes">
        <USelect
          :model-value="settings.thumbnailSize"
          :items="[
            { label: 'Petite', value: 'sm' },
            { label: 'Moyenne', value: 'md' },
            { label: 'Grande', value: 'lg' }
          ]"
          @update:model-value="saveInstant({ thumbnailSize: $event as AppSettings['thumbnailSize'] })"
        />
      </UFormField>
      <UFormField label="Chemin bibliothèque musicale">
        <UInput
          v-model="textDraft.libraryPath"
          @update:model-value="onTextInput({ libraryPath: $event as string })"
          @blur="saveTextOnBlur({ libraryPath: textDraft.libraryPath })"
        />
      </UFormField>
      <UFormField label="Chemin données app (.config)">
        <UInput
          v-model="textDraft.appDataPath"
          placeholder="~/Music/Luz/.config"
          @update:model-value="onTextInput({ appDataPath: ($event as string) || undefined })"
          @blur="saveTextOnBlur({ appDataPath: textDraft.appDataPath || undefined })"
        />
      </UFormField>
    </div>

    <div v-else-if="tab === 'download' && settings" class="space-y-4">
      <UFormField label="Format par défaut">
        <USelect
          :model-value="settings.downloadDefaults.format"
          :items="settings.supportedFormats.map(f => ({ label: f.toUpperCase(), value: f }))"
          @update:model-value="saveInstant({ downloadDefaults: { ...settings.downloadDefaults, format: $event as string } })"
        />
      </UFormField>
      <UFormField label="Qualité par défaut">
        <USelect
          :model-value="settings.downloadDefaults.quality"
          :items="[
            { label: 'Meilleure', value: 'best' },
            { label: '320 kbps', value: '320' }
          ]"
          @update:model-value="saveInstant({ downloadDefaults: { ...settings.downloadDefaults, quality: $event as string } })"
        />
      </UFormField>
      <UCheckbox
        :model-value="settings.downloadDefaults.embedCover"
        label="Intégrer la pochette"
        @update:model-value="saveInstant({ downloadDefaults: { ...settings.downloadDefaults, embedCover: $event as boolean } })"
      />
      <UCheckbox
        :model-value="settings.downloadDefaults.writeMetadata"
        label="Écrire les métadonnées"
        @update:model-value="saveInstant({ downloadDefaults: { ...settings.downloadDefaults, writeMetadata: $event as boolean } })"
      />
      <UFormField label="Stratégie feats">
        <USelect
          :model-value="settings.metadataRules.featStrategy"
          :items="[
            { label: 'Métadonnées uniquement', value: 'metadata_only' },
            { label: 'Partout', value: 'title_and_metadata' },
            { label: 'Titre uniquement', value: 'title_only' }
          ]"
          @update:model-value="saveInstant({ metadataRules: { featStrategy: $event as AppSettings['metadataRules']['featStrategy'] } })"
        />
      </UFormField>
      <UFormField label="Formule de sortie par défaut (bibliothèque)">
        <UTextarea
          v-model="textDraft.outputTemplate"
          :rows="2"
          placeholder="~/Music/Luz/%(artist)s/%(album)s/%(title)s.%(ext)s"
          @update:model-value="onTextInput({ outputTemplate: $event as string })"
          @blur="saveTextOnBlur({ outputTemplate: textDraft.outputTemplate })"
        />
      </UFormField>
      <UFormField label="Formule de sortie par défaut (playlists)" hint="%(playlist)s = nom de la playlist YouTube ou Luz">
        <UTextarea
          v-model="textDraft.playlistOutputTemplate"
          :rows="2"
          placeholder="~/Music/Luz/playlists/%(playlist)s/%(title)s.%(ext)s"
          @update:model-value="onTextInput({ playlistOutputTemplate: ($event as string) || undefined })"
          @blur="saveTextOnBlur({ playlistOutputTemplate: textDraft.playlistOutputTemplate || undefined })"
        />
      </UFormField>

      <SettingsYoutubeCookiesPanel />
    </div>

    <div v-else-if="tab === 'cache' && settings" class="space-y-4">
      <UFormField label="Politique de doublons">
        <USelect
          :model-value="settings.cachePolicy"
          :items="[
            { label: 'Demander', value: 'ask' },
            { label: 'Réutiliser', value: 'reuse' },
            { label: 'Dupliquer', value: 'duplicate' }
          ]"
          @update:model-value="saveInstant({ cachePolicy: $event as AppSettings['cachePolicy'] })"
        />
      </UFormField>
      <UButton variant="soft" label="Reconstruire le cache" @click="dangerAction('rebuild-cache', 'Cache reconstruit')" />
    </div>

    <div v-else-if="tab === 'system'" class="space-y-4">
      <div class="flex justify-end">
        <UButton icon="i-lucide-refresh-cw" variant="ghost" :loading="statusPending" @click="refreshStatus()" />
      </div>
      <div v-if="status" class="grid gap-4 sm:grid-cols-2">
        <UCard>
          <template #header><h3 class="font-semibold">yt-dlp</h3></template>
          <UBadge :color="status.ytdlp.available ? 'success' : 'error'" :label="status.ytdlp.available ? 'OK' : 'Manquant'" />
        </UCard>
        <UCard>
          <template #header><h3 class="font-semibold">FFmpeg</h3></template>
          <UBadge :color="status.ffmpeg.available ? 'success' : 'error'" :label="status.ffmpeg.available ? 'OK' : 'Manquant'" />
        </UCard>
        <UCard>
          <template #header><h3 class="font-semibold">ExifTool</h3></template>
          <UBadge :color="status.exiftool.available ? 'success' : 'warning'" :label="status.exiftool.available ? 'OK' : 'Manquant'" />
        </UCard>
        <UCard class="sm:col-span-2">
          <template #header><h3 class="font-semibold">Chemins</h3></template>
          <p class="text-xs break-all">{{ status.libraryPath }}</p>
          <p class="text-xs break-all mt-1">{{ status.dataDir }}</p>
        </UCard>
      </div>
      <div class="flex flex-wrap gap-2">
        <UButton label="Lancer un rescan" icon="i-lucide-scan" @click="dangerAction('rescan-library', 'Scan démarré')" />
        <UButton
          label="Corriger la bibliothèque"
          icon="i-lucide-wrench"
          variant="soft"
          @click="dangerAction('repair-library', 'Bibliothèque corrigée')"
        />
      </div>
      <p class="text-xs text-muted">
        La correction retire les morceaux manquants, renumérote les albums et nettoie les playlists après des modifications hors Luz.
      </p>
    </div>

    <div v-else-if="tab === 'danger'" class="space-y-3">
      <div class="flex gap-2">
        <UButton label="Exporter" icon="i-lucide-download" :loading="exporting" @click="exportData" />
        <UButton label="Importer" icon="i-lucide-upload" :loading="importing" @click="importInput?.click()" />
        <input ref="importInput" type="file" accept=".zip,.db" class="hidden" @change="onImportFile">
      </div>
      <SharedConfirmDangerAction
        action="reset-library"
        label="Réinitialiser la bibliothèque"
        confirm-text="Tous les index seront supprimés (pas les fichiers audio)."
        @confirm="dangerAction('reset-library', 'Bibliothèque réinitialisée')"
      />
      <SharedConfirmDangerAction
        action="clear-queue"
        label="Vider la file de téléchargement"
        @confirm="dangerAction('clear-queue', 'File vidée')"
      />
      <SharedConfirmDangerAction
        action="reset-settings"
        label="Réinitialiser les paramètres"
        @confirm="dangerAction('reset-settings', 'Paramètres réinitialisés')"
      />
    </div>
  </div>
</template>
