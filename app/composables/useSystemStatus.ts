import type { SystemDiagnostics } from '#shared/domain/system'

export function useSystemStatus() {
  const { data: status, refresh, pending } = useFetch<SystemDiagnostics>('/api/system/status', {
    key: 'system-status'
  })

  async function runAction(action: string) {
    return $fetch(`/api/system/actions/${action}`, { method: 'POST' })
  }

  return { status, refresh, pending, runAction }
}
