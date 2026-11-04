<script setup lang="ts">
import type { TrackSummary } from '@luz/core';
import type { DropdownMenuItem } from '@nuxt/ui';

const props = defineProps<{
	track: Pick<TrackSummary, 'id' | 'title' | 'fileName' | 'path'>;
}>();

const appConfig = useAppConfig();
const { copyPath } = useCopyPath();
const detailsOpen = ref(false);
const title = computed(() => trackTitle(props.track));

// Only actions that exist: editing and exporting join this menu with their features
const items = computed<DropdownMenuItem[]>(() => [
	{
		label: 'Show details',
		icon: appConfig.ui.icons.info,
		onSelect: () => {
			detailsOpen.value = true;
		},
	},
	{
		label: 'Copy path',
		icon: appConfig.ui.icons.copy,
		onSelect: () => copyPath(props.track.path),
	},
]);
</script>

<template>
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
	<UModal v-model:open="detailsOpen" :title="title" description="Track details">
		<template #body>
			<TrackDetails :id="track.id" />
		</template>
	</UModal>
</template>
