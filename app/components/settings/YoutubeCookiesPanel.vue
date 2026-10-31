<script setup lang="ts">
interface CookiesState {
  configured: boolean
  path: string
  content: string
  preview: string[]
  lastTest: { at: string, ok: boolean, message: string } | null
}

const { showError } = useAppToast()
const toast = useToast()

const { data, refresh, pending } = await useFetch<CookiesState>('/api/settings/youtube-cookies')
const content = ref('')
const dirty = ref(false)
const saving = ref(false)
const testing = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)

const guideOpen = ref(false)
const initialized = ref(false)

watch(data, (d) => {
  if (d && !dirty.value) {
    content.value = d.content ?? ''
    initialized.value = true
  }
}, { immediate: true })

watch(content, () => {
  if (initialized.value) dirty.value = true
})

const statusBadge = computed(() => {
  if (!data.value?.configured) {
    return { label: 'Non configuré', color: 'neutral' as const }
  }
  const test = data.value.lastTest
  if (test?.ok) return { label: 'Connecté', color: 'success' as const }
  if (test && !test.ok) return { label: 'Erreur', color: 'error' as const }
  return { label: 'Configuré (non testé)', color: 'warning' as const }
})

async function save() {
  saving.value = true
  try {
    await $fetch('/api/settings/youtube-cookies', {
      method: 'PUT',
      body: { content: content.value }
    })
    toast.add({ title: 'Cookies enregistrés', color: 'success' })
    dirty.value = false
    await refresh()
  } catch (e: unknown) {
    const msg = e && typeof e === 'object' && 'data' in e
      ? (e as { data?: { message?: string } }).data?.message
      : 'Enregistrement échoué'
    showError('Erreur', msg)
  } finally {
    saving.value = false
  }
}

async function testConnection() {
  testing.value = true
  try {
    const res = await $fetch<{ ok: boolean, message: string }>('/api/settings/youtube-cookies/test', {
      method: 'POST'
    })
    if (!res.ok) {
      showError('Test échoué', res.message)
    } else {
      toast.add({ title: 'Test réussi', description: res.message, color: 'success' })
    }
    await refresh()
  } catch (e: unknown) {
    const msg = e && typeof e === 'object' && 'data' in e
      ? (e as { data?: { message?: string } }).data?.message
      : 'Test échoué'
    showError('Erreur', msg)
    await refresh()
  } finally {
    testing.value = false
  }
}

async function clearCookies() {
  if (!confirm('Supprimer le fichier cookies YouTube ?')) return
  await $fetch('/api/settings/youtube-cookies', { method: 'DELETE' })
  content.value = ''
  dirty.value = false
  toast.add({ title: 'Cookies supprimés', color: 'success' })
  await refresh()
}

function onFileImport(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    content.value = String(reader.result ?? '')
  }
  reader.readAsText(file)
  ;(e.target as HTMLInputElement).value = ''
}
</script>

<template>
  <div class="space-y-4 rounded-lg border border-default p-4">
    <div class="flex items-start justify-between gap-3 flex-wrap">
      <div>
        <h3 class="font-semibold flex items-center gap-2">
          <UIcon name="i-lucide-cookie" class="size-5" />
          Cookies YouTube
        </h3>
        <p class="text-sm text-muted mt-1">
          Requis pour les vidéos avec restriction d'âge ou contenu privé.
        </p>
      </div>
      <UBadge :color="statusBadge.color" :label="statusBadge.label" />
    </div>

    <p v-if="data?.path" class="text-xs text-muted font-mono break-all">
      {{ data.path }}
    </p>

    <p v-if="data?.lastTest" class="text-sm" :class="data.lastTest.ok ? 'text-success' : 'text-error'">
      Dernier test : {{ data.lastTest.message }}
    </p>

    <UCollapsible v-model:open="guideOpen">
      <UButton
        variant="ghost"
        color="neutral"
        size="sm"
        label="Comment obtenir un cookies.txt ?"
        trailing-icon="i-lucide-chevron-down"
      />
      <template #content>
        <div class="text-sm text-muted space-y-2 mt-2 pl-1">
          <p>
            Format requis : <strong>Netscape cookies.txt</strong> (utilisé par yt-dlp avec <code>--cookies</code>).
          </p>
          <ul class="list-disc pl-5 space-y-1">
            <li>Chrome / Edge : extension « Get cookies.txt LOCALLY » → exporter pour <code>youtube.com</code></li>
            <li>Firefox : extension « cookies.txt »</li>
            <li>Coller le contenu ci-dessous ou importer le fichier</li>
          </ul>
          <p>
            <a
              href="https://github.com/yt-dlp/yt-dlp/wiki/FAQ#how-do-i-pass-cookies-to-yt-dlp"
              target="_blank"
              rel="noopener noreferrer"
              class="text-primary hover:underline"
            >
              FAQ yt-dlp — cookies
            </a>
          </p>
        </div>
      </template>
    </UCollapsible>

    <UFormField label="Contenu cookies.txt">
      <UTextarea
        v-model="content"
        :rows="8"
        placeholder="# Netscape HTTP Cookie File&#10;.youtube.com	TRUE	/	TRUE	0	..."
        class="font-mono text-xs"
      />
    </UFormField>

    <div class="flex flex-wrap gap-2">
      <UButton label="Enregistrer" icon="i-lucide-save" :loading="saving" @click="save" />
      <UButton
        label="Tester la connexion"
        icon="i-lucide-plug-zap"
        variant="soft"
        :loading="testing"
        :disabled="!content.trim() && !data?.configured"
        @click="testConnection"
      />
      <UButton label="Importer un fichier" icon="i-lucide-upload" variant="outline" @click="fileInput?.click()" />
      <input ref="fileInput" type="file" accept=".txt" class="hidden" @change="onFileImport">
      <UButton
        v-if="data?.configured"
        label="Effacer"
        icon="i-lucide-trash-2"
        color="error"
        variant="ghost"
        @click="clearCookies"
      />
    </div>

    <div v-if="pending" class="text-sm text-muted">Chargement…</div>
  </div>
</template>
