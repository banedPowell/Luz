import { defineStore } from 'pinia'
import type { DownloadJob } from '#shared/domain/download'

export const useDownloadQueueStore = defineStore('downloadQueue', () => {
  const jobs = ref<DownloadJob[]>([])
  const history = ref<DownloadJob[]>([])
  const connected = ref(false)
  let eventSource: EventSource | null = null

  function connect() {
    if (import.meta.server || eventSource) return
    eventSource = new EventSource('/api/downloads/events')
    eventSource.addEventListener('queue', (e) => {
      jobs.value = (JSON.parse(e.data) as DownloadJob[]).map(j => ({
        ...j,
        tracks: j.tracks.map(t => ({ ...t }))
      }))
      connected.value = true
    })
    eventSource.addEventListener('history', (e) => {
      history.value = JSON.parse(e.data)
    })
    eventSource.addEventListener('job', (e) => {
      const job = JSON.parse(e.data) as DownloadJob
      const idx = jobs.value.findIndex(j => j.id === job.id)
      const prev = idx >= 0 ? jobs.value[idx] : undefined
      const next = { ...job, tracks: job.tracks.map(t => ({ ...t })) }
      if (idx >= 0) jobs.value.splice(idx, 1, next)
      else if (!['finished', 'cancelled', 'failed'].includes(job.status)) {
        jobs.value.push(next)
      }

      if (
        job.status === 'failed'
        && job.errors?.length
        && prev?.status !== 'failed'
      ) {
        const { showError } = useAppToast()
        showError('Téléchargement échoué', job.errors[job.errors.length - 1])
      } else if (
        job.status === 'finished'
        && job.errors?.length
        && prev?.status !== 'finished'
      ) {
        const { showWarning } = useAppToast()
        showWarning('Import partiel', job.errors[job.errors.length - 1])
      }
    })
    eventSource.addEventListener('library:updated', () => {
      invalidateLibrary()
    })
    eventSource.onerror = () => {
      connected.value = false
    }
  }

  function disconnect() {
    eventSource?.close()
    eventSource = null
    connected.value = false
  }

  async function refresh() {
    const [queue, hist] = await Promise.all([
      $fetch<DownloadJob[]>('/api/downloads/queue'),
      $fetch<DownloadJob[]>('/api/downloads/history')
    ])
    jobs.value = queue.map(j => ({ ...j, tracks: j.tracks.map(t => ({ ...t })) }))
    history.value = hist
  }

  async function enqueue(body: Record<string, unknown>) {
    const job = await $fetch<DownloadJob>('/api/downloads/queue', { method: 'POST', body })
    await refresh()
    return job
  }

  async function cancel(jobId: string) {
    await $fetch(`/api/downloads/${jobId}`, { method: 'DELETE' })
    await refresh()
  }

  async function dismiss(jobId: string) {
    await $fetch(`/api/downloads/${jobId}/dismiss`, { method: 'DELETE' })
    await refresh()
  }

  const activeCount = computed(() =>
    jobs.value.filter(j => !['finished', 'cancelled', 'failed'].includes(j.status)).length
  )

  return { jobs, history, connected, activeCount, connect, disconnect, refresh, enqueue, cancel, dismiss }
})
