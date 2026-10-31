export function useAppToast() {
  const toast = useToast()

  function copyText(title: string, description?: string) {
    const text = description ? `${title}\n${description}` : title
    navigator.clipboard.writeText(text).catch(() => {})
  }

  function showError(title: string, description?: string) {
    toast.add({
      title,
      description,
      color: 'error',
      actions: [{
        label: 'Copier',
        onClick: () => copyText(title, description)
      }]
    })
  }

  function showWarning(title: string, description?: string) {
    toast.add({
      title,
      description,
      color: 'warning',
      actions: description ? [{
        label: 'Copier',
        onClick: () => copyText(title, description)
      }] : undefined
    })
  }

  return { showError, showWarning, toast }
}
