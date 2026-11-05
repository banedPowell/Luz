<script setup lang="ts">
defineProps<{
	// Names the landmark for screen readers
	label: string;
}>();

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
</script>

<template>
	<!-- Fixed rather than sticky, since the window scrolls, not the shell's main area.
	     Room at the end of the list, so the bar never hides the last row or the pages -->
	<div ref="room" aria-hidden="true" class="h-12 shrink-0" />
	<section
		:aria-label="label"
		:style="edges"
		class="fixed inset-x-4 bottom-4 z-10 flex items-center gap-2 rounded-md bg-elevated py-1 ps-3 pe-1 shadow-lg ring ring-default"
	>
		<slot />
	</section>
</template>
