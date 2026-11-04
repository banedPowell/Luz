/**
 * Copies a file or folder path, saying so in a toast: the menu that offered the action has
 * closed by then, so the toast is the only feedback the user gets.
 */
export function useCopyPath() {
	const toast = useToast();
	const appConfig = useAppConfig();

	async function copyPath(path: string): Promise<void> {
		try {
			await navigator.clipboard.writeText(path);
		} catch {
			// The clipboard needs a secure context and the page's permission
			toast.add({
				title: 'Could not copy the path',
				description: 'Select it and copy it by hand.',
				color: 'error',
				icon: appConfig.ui.icons.error,
			});
			return;
		}
		toast.add({
			title: 'Path copied',
			description: path,
			icon: appConfig.ui.icons.copyCheck,
		});
	}

	return { copyPath };
}
