<script setup lang="ts">
const { status, refresh, pending, runAction } = useSystemStatus()
const toast = useToast()

function formatBytes(bytes: number) {
  if (!bytes) return '—'
  const gb = bytes / 1024 / 1024 / 1024
  return `${gb.toFixed(2)} Go`
}

async function rescan() {
  const result = await runAction('rescan-library') as { message: string }
  toast.add({ title: 'Scan', description: result.message, color: 'success' })
}
</script>

<template>
  <div class="space-y-6 max-w-2xl">
    <UButton to="/settings" variant="ghost" icon="i-lucide-arrow-left" label="Retour" />

    <div class="flex items-center justify-between">
      <h2 class="text-2xl font-bold">État du système</h2>
      <UButton icon="i-lucide-refresh-cw" variant="ghost" :loading="pending" @click="refresh()" />
    </div>

    <div v-if="status" class="grid gap-4 sm:grid-cols-2">
      <UCard>
        <template #header>
          <h3 class="font-semibold">yt-dlp</h3>
        </template>
        <UBadge :color="status.ytdlp.available ? 'success' : 'error'" :label="status.ytdlp.available ? 'Disponible' : 'Indisponible'" />
        <p class="text-sm text-muted mt-2">{{ status.ytdlp.version || '—' }}</p>
        <p class="text-xs text-muted">{{ status.ytdlp.path }}</p>
      </UCard>

      <UCard>
        <template #header>
          <h3 class="font-semibold">FFmpeg</h3>
        </template>
        <UBadge :color="status.ffmpeg.available ? 'success' : 'error'" :label="status.ffmpeg.available ? 'Disponible' : 'Indisponible'" />
        <p class="text-sm text-muted mt-2">{{ status.ffmpeg.version || '—' }}</p>
      </UCard>

      <UCard>
        <template #header>
          <h3 class="font-semibold">ExifTool</h3>
        </template>
        <UBadge :color="status.exiftool.available ? 'success' : 'warning'" :label="status.exiftool.available ? 'Disponible' : 'Indisponible'" />
        <p class="text-sm text-muted mt-2">{{ status.exiftool.version || '—' }}</p>
        <p class="text-xs text-muted">{{ status.exiftool.path }}</p>
        <p v-if="!status.exiftool.available" class="text-xs text-muted mt-2">
          Requis pour le N° piste des fichiers M4A (winget install ExifTool.ExifTool).
        </p>
      </UCard>

      <UCard>
        <template #header>
          <h3 class="font-semibold">Stockage</h3>
        </template>
        <p class="text-sm">{{ formatBytes(status.disk.free) }} libres / {{ formatBytes(status.disk.total) }}</p>
        <p class="text-xs text-muted mt-1">Bibliothèque : {{ formatBytes(status.library.sizeOnDisk) }}</p>
      </UCard>

      <UCard>
        <template #header>
          <h3 class="font-semibold">Bibliothèque</h3>
        </template>
        <ul class="text-sm space-y-1">
          <li>{{ status.library.artists }} artistes</li>
          <li>{{ status.library.albums }} albums</li>
          <li>{{ status.library.tracks }} morceaux</li>
          <li>{{ status.library.playlists }} playlists</li>
        </ul>
      </UCard>

      <UCard class="sm:col-span-2">
        <template #header>
          <h3 class="font-semibold">Chemins</h3>
        </template>
        <p class="text-sm"><span class="text-muted">Données :</span> {{ status.dataDir }}</p>
        <p class="text-sm mt-1"><span class="text-muted">Musique :</span> {{ status.libraryPath }}</p>
        <p v-if="status.lastScanAt" class="text-xs text-muted mt-2">Dernier scan : {{ status.lastScanAt }}</p>
      </UCard>
    </div>

    <UButton label="Lancer un rescan" icon="i-lucide-scan" @click="rescan" />
  </div>
</template>
