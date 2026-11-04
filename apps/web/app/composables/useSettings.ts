import type { Settings, SettingsPatch } from '@luz/core';

/**
 * The settings stored by the server, shared by every page. The theme is not one of them:
 * it is a browser preference handled by useColorMode() (ADR 0006).
 */
export function useSettings() {
	const settings = useState<Settings | undefined>('settings', () => undefined);

	async function load(): Promise<Settings> {
		const loaded = await useRequestFetch()('/api/settings');
		settings.value = loaded;
		return loaded;
	}

	async function update(patch: SettingsPatch): Promise<Settings> {
		const updated = await $fetch('/api/settings', { method: 'PATCH', body: patch });
		settings.value = updated;
		return updated;
	}

	return { settings: readonly(settings), load, update };
}
