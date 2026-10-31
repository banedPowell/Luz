<script setup lang="ts">
import type { DownloadAnalysis, DestinationContext } from '#shared/domain/download'
import type { AppSettings } from '#shared/domain/settings'
import {
  resolveDestinationMode,
  resolveEffectiveOutputTemplate,
  resolvePlaylistFolderName
} from '#shared/utils/download-destination'

const options = defineModel<{
  format: string
  quality: string
  embedCover: boolean
  writeMetadata: boolean
  featStrategy: string
  destinationMode: 'auto' | 'library' | 'playlist'
}>({ required: true })

const customArgs = defineModel<string>('customArgs', { default: '' })
const outputTemplate = defineModel<string>('outputTemplate', { default: '' })

const props = defineProps<{
  analysis?: DownloadAnalysis | null
  commandPreview?: string
  supportedFormats?: string[]
  settings?: AppSettings | null
  destinationContext?: DestinationContext
  luzPlaylistName?: string
}>()

const formatItems = computed(() => {
  const all = [
    { label: 'M4A', value: 'm4a' },
    { label: 'MP3', value: 'mp3' },
    { label: 'FLAC', value: 'flac' },
    { label: 'Opus', value: 'opus' },
    { label: 'Meilleur audio', value: 'bestaudio' }
  ]
  if (!props.supportedFormats?.length) return all
  return all.filter(f => props.supportedFormats!.includes(f.value))
})

const qualityItems = [
  { label: 'Meilleure', value: 'best' },
  { label: '320 kbps', value: '320' },
  { label: '256 kbps', value: '256' },
  { label: '192 kbps', value: '192' }
]

const effectiveMode = computed(() => resolveDestinationMode(
  options.value.destinationMode,
  props.destinationContext ?? { type: 'root' },
  props.analysis?.tracks.length ?? 0,
  props.analysis?.url
))

const playlistFolderName = computed(() => resolvePlaylistFolderName({
  luzPlaylistName: props.luzPlaylistName,
  sourceTitle: props.analysis?.title
}))

const defaultTemplate = computed(() => {
  if (!props.settings) return ''
  return resolveEffectiveOutputTemplate(props.settings, effectiveMode.value)
})

const destinationHint = computed(() => {
  if (effectiveMode.value === 'playlist') {
    return `Fichiers dans playlists/${playlistFolderName.value}/`
  }
  return 'Fichiers classés par artiste et album (métadonnées)'
})

const templatePlaceholder = computed(() =>
  effectiveMode.value === 'playlist'
    ? '~/Music/Luz/playlists/%(playlist)s/%(title)s.%(ext)s'
    : '~/Music/Luz/%(artist)s/%(album)s/%(title)s.%(ext)s'
)

const templateHint = computed(() =>
  effectiveMode.value === 'playlist'
    ? '%(playlist)s = nom de la playlist. Laisser vide pour la formule par défaut des paramètres.'
    : '%(artist)s = artiste principal (sans feats). Laisser vide pour la formule par défaut.'
)

const accordionItems = [
  { label: 'Téléchargement', slot: 'download', defaultOpen: true },
  { label: 'Métadonnées', slot: 'metadata' },
  { label: 'Organisation', slot: 'organization', defaultOpen: true },
  { label: 'Avancé', slot: 'advanced' }
]
</script>

<template>
  <UCard class="sticky top-4">
    <template #header>
      <h3 class="font-semibold">Options</h3>
    </template>

    <UAccordion :items="accordionItems" multiple>
      <template #download>
        <div class="space-y-3 p-1">
          <UFormField label="Format">
            <USelect v-model="options.format" :items="formatItems" />
          </UFormField>
          <UFormField label="Qualité">
            <USelect v-model="options.quality" :items="qualityItems" />
          </UFormField>
          <UCheckbox v-model="options.embedCover" label="Intégrer la pochette" />
        </div>
      </template>

      <template #metadata>
        <div class="space-y-3 p-1">
          <UCheckbox v-model="options.writeMetadata" label="Écrire les métadonnées" />
          <UFormField label="Stratégie feats">
            <USelect
              v-model="options.featStrategy"
              :items="[
                { label: 'Feats dans métadonnées uniquement', value: 'metadata_only' },
                { label: 'Feats partout', value: 'title_and_metadata' },
                { label: 'Feats dans titre uniquement', value: 'title_only' }
              ]"
            />
          </UFormField>
        </div>
      </template>

      <template #organization>
        <div class="space-y-3 p-1">
          <UFormField label="Destination des fichiers">
            <USelect
              v-model="options.destinationMode"
              :items="[
                { label: 'Automatique', value: 'auto' },
                { label: 'Bibliothèque (artiste / album)', value: 'library' },
                { label: 'Dossier playlist', value: 'playlist' }
              ]"
            />
          </UFormField>
          <p class="text-sm text-muted">{{ destinationHint }}</p>
          <p v-if="defaultTemplate && !outputTemplate" class="text-xs text-muted font-mono break-all">
            {{ defaultTemplate }}
          </p>
        </div>
      </template>

      <template #advanced>
        <div class="space-y-3 p-1">
          <UFormField label="Formule de sortie (surcharge)" :hint="templateHint">
            <UTextarea
              v-model="outputTemplate"
              :rows="3"
              :placeholder="templatePlaceholder"
            />
          </UFormField>
          <UFormField label="Arguments yt-dlp supplémentaires">
            <UTextarea v-model="customArgs" :rows="2" placeholder="--geo-bypass" />
          </UFormField>
          <UFormField label="Commande complète (aperçu)">
            <pre class="text-xs font-mono bg-muted/50 p-2 rounded-lg overflow-x-auto whitespace-pre-wrap">{{ commandPreview || 'Analysez une URL pour prévisualiser' }}</pre>
          </UFormField>
        </div>
      </template>
    </UAccordion>
  </UCard>
</template>
