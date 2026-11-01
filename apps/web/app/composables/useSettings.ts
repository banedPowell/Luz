import type { Settings, SettingsPatch } from '@luz/core';

/**
 * The settings stored by the server, shared by every page. The database is the only
 * source of truth: the theme is applied to color-mode from what the API returns.
 */
export function useSettings() {
	const settings = useState<Settings | undefined>('settings', () => undefined);
	const colorMode = useColorMode();

	async function load(): Promise<Settings> {
		const loaded = await useRequestFetch()('/api/settings');
		settings.value = loaded;
		return loaded;
	}

	async function update(patch: SettingsPatch): Promise<Settings> {
		const updated = await $fetch('/api/settings', { method: 'PATCH', body: patch });
		settings.value = updated;
		colorMode.preference = updated.theme;
		return updated;
	}

	return { settings: readonly(settings), load, update };
}
