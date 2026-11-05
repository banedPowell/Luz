<script setup lang="ts">
import type { TrackSummary } from '@luz/core';
import type { DropdownMenuItem } from '@nuxt/ui';

const props = defineProps<{
	track: Pick<TrackSummary, 'id' | 'title' | 'fileName' | 'path'>;
}>();

const appConfig = useAppConfig();
const { copyPath } = useCopyPath();
const { rescan } = useLibraryScan();
const detailsOpen = ref(false);
const title = computed(() => trackTitle(props.track));

// The rows only show what a listener scans; release, file and audio details sit behind the
// info button. Editing and exporting join the menu with their features
const items = computed<DropdownMenuItem[]>(() => [
	{
		label: 'Copy path',
		icon: appConfig.ui.icons.copy,
		onSelect: () => copyPath(props.track.path),
	},
	{
		label: 'Rescan',
		icon: appConfig.ui.icons.reload,
		onSelect: () => rescan({ kind: 'tracks', ids: [props.track.id] }),
	},
]);
</script>

<template>
	<div class="flex items-center justify-end">
		<UTooltip text="Show details">
			<UButton
				:icon="appConfig.ui.icons.info"
				color="neutral"
				variant="ghost"
				square
				class="size-10 justify-center md:size-8"
				:aria-label="`Show details of ${title}`"
				@click="detailsOpen = true"
			/>
		</UTooltip>
		<UDropdownMenu :items="items" :content="{ align: 'end' }">
			<UButton
				:icon="appConfig.ui.icons.ellipsis"
				color="neutral"
				variant="ghost"
				square
				class="size-10 justify-center md:size-8"
				:aria-label="`More actions for ${title}`"
			/>
		</UDropdownMenu>
	</div>
	<UModal v-model:open="detailsOpen" :title="title" description="Track details">
		<template #body>
			<TrackDetails :id="track.id" />
		</template>
	</UModal>
</template>
