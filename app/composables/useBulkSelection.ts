export function useBulkSelection<T extends { id: string }>(items: Ref<T[] | undefined>) {
  const selectedIds = ref<Set<string>>(new Set())

  const selectedCount = computed(() => selectedIds.value.size)
  const hasSelection = computed(() => selectedIds.value.size > 0)

  function toggle(id: string) {
    const next = new Set(selectedIds.value)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    selectedIds.value = next
  }

  function selectAll() {
    selectedIds.value = new Set((items.value || []).map(i => i.id))
  }

  function clear() {
    selectedIds.value = new Set()
  }

  function isSelected(id: string) {
    return selectedIds.value.has(id)
  }

  return { selectedIds, selectedCount, hasSelection, toggle, selectAll, clear, isSelected }
}
