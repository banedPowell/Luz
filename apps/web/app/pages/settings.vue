<script setup lang="ts">
import { settingsPatchSchema, type Settings, type SettingsPatch, type Theme } from '@luz/core';
import type { FormError, SelectItem } from '@nuxt/ui';

const { settings, load, update } = useSettings();
const appConfig = useAppConfig();
const toast = useToast();

const loadError = ref(false);
const state = reactive({ theme: 'system' as Theme, musicLibraryPath: '' });

function fill(values: Settings) {
	state.theme = values.theme;
	state.musicLibraryPath = values.musicLibraryPath ?? '';
}

async function retryLoad() {
	try {
		fill(await load());
		loadError.value = false;
	} catch {
		loadError.value = true;
	}
}

// Usually loaded during server rendering (plugins/settings.server.ts)
if (settings.value) {
	fill(settings.value);
} else {
	await retryLoad();
}

// The sidebar theme menu saves on its own: keep the form in step with it
watch(
	() => settings.value?.theme,
	(theme) => {
		if (theme) {
			state.theme = theme;
		}
	},
);

const themeItems = computed(
	() =>
		[
			{ value: 'system', label: 'System', icon: appConfig.ui.icons.system },
			{ value: 'light', label: 'Light', icon: appConfig.ui.icons.light },
			{ value: 'dark', label: 'Dark', icon: appConfig.ui.icons.dark },
		] satisfies (SelectItem & { value: Theme })[],
);

// An empty field clears the path, which the API takes as null
function toPatch(values: Partial<typeof state>): SettingsPatch {
	return {
		theme: values.theme,
		musicLibraryPath: values.musicLibraryPath?.trim() ? values.musicLibraryPath : null,
	};
}

// The same schema as the API, so the form shows exactly the errors the server would return
function validate(values: Partial<typeof state>): FormError[] {
	const result = settingsPatchSchema.safeParse(toPatch(values));
	return result.success
		? []
		: result.error.issues.map((issue) => ({
				name: String(issue.path[0] ?? ''),
				message: issue.message,
			}));
}

async function save() {
	try {
		fill(await update(toPatch(state)));
		toast.add({ title: 'Settings saved', color: 'success', icon: appConfig.ui.icons.success });
	} catch {
		toast.add({
			title: 'Could not save the settings',
			description: 'Your changes are still in the form. Try again later.',
			color: 'error',
			icon: appConfig.ui.icons.error,
		});
	}
}
</script>

<template>
	<div class="mx-auto flex w-full max-w-2xl flex-col gap-6">
		<UAlert
			v-if="loadError"
			title="Could not load the settings"
			description="The values below are the defaults, not your saved settings."
			color="error"
			variant="subtle"
			:icon="appConfig.ui.icons.error"
			:actions="[{ label: 'Retry', color: 'error', variant: 'outline', onClick: retryLoad }]"
		/>

		<UForm
			:state="state"
			:validate="validate"
			:disabled="loadError"
			class="flex flex-col gap-6"
			@submit="save"
		>
			<UFormField
				name="theme"
				label="Theme"
				description="System follows the light or dark setting of your device."
			>
				<USelect
					v-model="state.theme"
					:items="themeItems"
					:icon="themeItems.find((item) => item.value === state.theme)?.icon"
					class="w-full sm:w-56"
				/>
			</UFormField>

			<UFormField
				name="musicLibraryPath"
				label="Music library"
				description="Absolute path of the folder that holds your music. Leave empty if you have none yet."
			>
				<UInput
					v-model="state.musicLibraryPath"
					placeholder="/home/me/Music or D:\Music"
					:icon="appConfig.ui.icons.folder"
					autocomplete="off"
					spellcheck="false"
					class="w-full"
				/>
			</UFormField>

			<div>
				<UButton type="submit" label="Save" :disabled="loadError" loading-auto />
			</div>
		</UForm>
	</div>
</template>
