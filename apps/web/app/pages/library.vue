<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui';

const { settings } = useSettings();
const appConfig = useAppConfig();
const { failure } = useLibraryScan();
const route = useRoute();

// Loaded during server rendering (plugins/settings.server.ts); a scan refused for a
// missing path also lands here, in case the settings changed in another tab
const pathUnset = computed(
	() => !settings.value?.musicLibraryPath || failure.value === 'library-path-unset',
);

// Detail pages belong to the view they were opened from; search results to none
const views = computed<NavigationMenuItem[]>(() => [
	{ label: 'Tracks', to: '/library', active: route.path === '/library' },
	{ label: 'Albums', to: '/library/albums', active: route.path.startsWith('/library/albums') },
	{ label: 'Artists', to: '/library/artists', active: route.path.startsWith('/library/artists') },
]);
</script>

<template>
	<UEmpty
		v-if="pathUnset"
		icon="i-pixelarticons-library"
		title="No music folder yet"
		description="Choose the folder that holds your music in the settings, then scan it."
		variant="naked"
		class="h-full"
		:actions="[{ label: 'Open settings', to: '/settings', icon: appConfig.ui.icons.folder }]"
	/>

	<div v-else class="mx-auto flex w-full max-w-5xl flex-col gap-6">
		<LibraryScan :music-library-path="settings?.musicLibraryPath ?? ''" />
		<!-- On narrow screens the field goes under the views, as in the tab order -->
		<div
			class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:border-b sm:border-default"
		>
			<UNavigationMenu
				:items="views"
				orientation="horizontal"
				aria-label="Library views"
				class="border-b border-default sm:border-0"
			/>
			<LibrarySearch class="sm:w-72" />
		</div>
		<NuxtPage />
	</div>
</template>
