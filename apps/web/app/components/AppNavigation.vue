<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui';

const { collapsed = false } = defineProps<{
	collapsed?: boolean;
}>();

const route = useRoute();

const items = computed<NavigationMenuItem[]>(() => {
	const current = findNavigationEntry(route.path);
	return navigationEntries.map((entry) => ({
		label: entry.label,
		icon: entry.icon,
		to: entry.to,
		active: entry === current,
	}));
});
</script>

<template>
	<UNavigationMenu
		:items="items"
		:collapsed="collapsed"
		:tooltip="collapsed"
		orientation="vertical"
		aria-label="Main"
		:ui="{ link: 'p-1.5 overflow-hidden' }"
	/>
</template>
