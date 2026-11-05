<script setup lang="ts">
import type { ListSelection } from '~/composables/useListSelection';

const props = defineProps<{
	selection: ListSelection;
	// What the rows are, for the count and the scan scope
	kind: 'tracks' | 'albums';
}>();

const appConfig = useAppConfig();
const { rescan } = useLibraryScan();
const rescanning = ref(false);

const word = computed(() => (props.kind === 'tracks' ? 'track' : 'album'));

// A refused rescan keeps the selection, so the user can try again
async function rescanSelection() {
	rescanning.value = true;
	try {
		if (await rescan({ kind: props.kind, ids: props.selection.ids.value })) {
			props.selection.clear();
		}
	} finally {
		rescanning.value = false;
	}
}
</script>

<template>
	<!-- Only actions that exist: editing and "Export to…" join with their features.
	     It floats at the bottom of the screen: placed above the list, it would push the rows
	     down under the pointer the moment the first one is checked -->
	<FloatingBar v-if="selection.count.value > 0" label="Selection">
		<p class="text-sm font-medium text-highlighted" aria-live="polite">
			{{ plural(selection.count.value, word) }} selected
		</p>
		<UButton
			label="Rescan"
			:icon="appConfig.ui.icons.reload"
			:loading="rescanning"
			color="neutral"
			variant="ghost"
			class="ms-auto h-10 md:h-8"
			@click="rescanSelection"
		/>
		<UTooltip text="Clear selection">
			<UButton
				:icon="appConfig.ui.icons.close"
				color="neutral"
				variant="ghost"
				square
				class="size-10 justify-center md:size-8"
				aria-label="Clear selection"
				@click="selection.clear()"
			/>
		</UTooltip>
	</FloatingBar>
</template>
