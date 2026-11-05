<script setup lang="ts">
import type { AlbumSummary } from '@luz/core';
import type { DropdownMenuItem } from '@nuxt/ui';

const props = defineProps<{
	album: Pick<AlbumSummary, 'id' | 'title'>;
}>();

const appConfig = useAppConfig();
const { rescan } = useLibraryScan();

// The row menu of an album, in lists and on its page; editing and exporting join it with
// their features
const items = computed<DropdownMenuItem[]>(() => [
	{
		label: 'Rescan',
		icon: appConfig.ui.icons.reload,
		onSelect: () => rescan({ kind: 'albums', ids: [props.album.id] }),
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
			:aria-label="`More actions for ${albumTitle(album.title)}`"
		/>
	</UDropdownMenu>
</template>
