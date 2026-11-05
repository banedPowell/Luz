<script setup lang="ts">
import {
	defaultNamingTemplate,
	namingPlaceholders,
	namingTemplateSchema,
	renderTrackPath,
	sampleTrackTags,
	settingsPatchSchema,
	themes,
	type Settings,
	type SettingsPatch,
	type Theme,
} from '@luz/core';
import type { FormError, SelectItem } from '@nuxt/ui';

const { settings, load, update } = useSettings();
const appConfig = useAppConfig();
const toast = useToast();
const colorMode = useColorMode();

const loadError = ref(false);
const state = reactive({ musicLibraryPath: '', namingTemplate: defaultNamingTemplate });

function fill(values: Settings) {
	state.musicLibraryPath = values.musicLibraryPath ?? '';
	state.namingTemplate = values.namingTemplate;
}

const placeholderList = namingPlaceholders.map((name) => `{${name}}`).join(' ');

// Rendered from made-up tags as the user types; nothing while the template is invalid,
// since the form shows the error in its place
const namingExample = computed(() => {
	const result = namingTemplateSchema.safeParse(state.namingTemplate);
	return result.success ? renderTrackPath(result.data, sampleTrackTags, 'flac') : undefined;
});

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

const themeItems = computed(
	() =>
		[
			{ value: 'system', label: 'System', icon: appConfig.ui.icons.system },
			{ value: 'light', label: 'Light', icon: appConfig.ui.icons.light },
			{ value: 'dark', label: 'Dark', icon: appConfig.ui.icons.dark },
		] satisfies (SelectItem & { value: Theme })[],
);

// Applied at once and kept by color-mode in its cookie, outside the saved settings (ADR 0006)
const theme = computed<Theme>({
	get: () => themes.find((value) => value === colorMode.preference) ?? 'system',
	set: (value) => {
		colorMode.preference = value;
	},
});

// An empty field clears the path, which the API takes as null
function toPatch(values: Partial<typeof state>): SettingsPatch {
	return {
		musicLibraryPath: values.musicLibraryPath?.trim() ? values.musicLibraryPath : null,
		namingTemplate: values.namingTemplate,
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

		<UFormField
			label="Theme"
			description="Applied at once, in this browser only. System follows the light or dark setting of your device."
		>
			<USelect
				v-model="theme"
				:items="themeItems"
				:icon="themeItems.find((item) => item.value === theme)?.icon"
				aria-label="Theme"
				class="w-full sm:w-56"
			/>
		</UFormField>

		<USeparator />

		<UForm
			:state="state"
			:validate="validate"
			:disabled="loadError"
			class="flex flex-col gap-6"
			@submit="save"
		>
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

			<UFormField
				name="namingTemplate"
				label="File names"
				:description="`Where downloaded files land in the library. Use / between folders and the placeholders ${placeholderList}; {track:02} pads with zeros.`"
				:help="namingExample && `Example: ${namingExample}`"
			>
				<UInput
					v-model="state.namingTemplate"
					:placeholder="defaultNamingTemplate"
					autocomplete="off"
					spellcheck="false"
					class="w-full"
					:ui="{ base: 'font-mono' }"
				/>
			</UFormField>

			<div>
				<UButton type="submit" label="Save" :disabled="loadError" loading-auto />
			</div>
		</UForm>

		<USeparator />

		<ToolStatusList />
	</div>
</template>
