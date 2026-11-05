<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui';
import type { NavigationEntry } from '~/utils/navigation';

const { collapsed = false, placement = 'main' } = defineProps<{
	collapsed?: boolean;
	placement?: NavigationEntry['placement'];
}>();

// Two landmarks in one sidebar: each needs its own name
const label = computed(() => (placement === 'main' ? 'Main' : 'Secondary'));

const route = useRoute();

const items = computed<NavigationMenuItem[]>(() => {
	const current = findNavigationEntry(route.path);
	return navigationEntries
		.filter((entry) => entry.placement === placement)
		.map((entry) => ({
			label: entry.label,
			icon: entry.icon,
			to: entry.to,
			active: entry === current,
			// Collapsed, the label span is display: none and the icon is aria-hidden,
			// so the link needs its name from an attribute
			...(collapsed ? { 'aria-label': entry.label } : {}),
		}));
});
</script>

<template>
	<UNavigationMenu
		:items="items"
		:collapsed="collapsed"
		:tooltip="collapsed"
		orientation="vertical"
		:aria-label="label"
		:ui="{ link: 'p-1.5 overflow-hidden' }"
	/>
</template>
