import type { AppSettings } from '#shared/domain/settings'

export function useSettings() {
  const { data: settings, refresh } = useFetch<AppSettings>('/api/settings', {
    key: 'settings'
  })

  async function update(partial: Partial<AppSettings>, opts?: { silent?: boolean }) {
    await $fetch('/api/settings', { method: 'PATCH', body: partial })
    if (!opts?.silent) await refresh()
  }

  return { settings, refresh, update }
}
