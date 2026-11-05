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

// The bar is as wide as its list: across the window, it would also cover the sidebar.
// A fixed element cannot take the width of its parent, so the room kept at the end of
// the list, which has it, is measured; `inset-x-4` holds until then
const room = useTemplateRef<HTMLElement>('room');
const edges = ref<{ left: string; right: string }>();

watch(room, (element, _previous, onCleanup) => {
	if (!element || typeof ResizeObserver === 'undefined') {
		return;
	}
	// The sidebar collapsing or the window resizing changes the width of the list
	const observer = new ResizeObserver(() => {
		const box = element.getBoundingClientRect();
		// The viewport a fixed element is placed in leaves out the scrollbar
		const width = document.documentElement.clientWidth;
		edges.value = { left: `${box.left}px`, right: `${width - box.right}px` };
	});
	observer.observe(element);
	onCleanup(() => observer.disconnect());
});

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
	     down under the pointer the moment the first one is checked. Fixed rather than sticky,
	     since the window scrolls, not the shell's main area -->
	<template v-if="selection.count.value > 0">
		<!-- Room at the end of the list, so the bar never hides the last row or the pages -->
		<div ref="room" aria-hidden="true" class="h-12 shrink-0" />
		<section
			aria-label="Selection"
			:style="edges"
			class="fixed inset-x-4 bottom-4 z-10 flex items-center gap-2 rounded-md bg-elevated py-1 ps-3 pe-1 shadow-lg ring ring-default"
		>
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
		</section>
	</template>
</template>
