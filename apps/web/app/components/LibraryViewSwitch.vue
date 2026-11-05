<script setup lang="ts">
import type { ListView } from '@luz/core';

const { view, linkToView } = useListView();

const options: { value: ListView; label: string; icon: string }[] = [
	{ value: 'table', label: 'Table', icon: 'i-pixelarticons-list' },
	{ value: 'grid', label: 'Grid', icon: 'i-pixelarticons-grid' },
];

// `v` flips the view; Nuxt UI leaves shortcuts without modifier alone inside text fields
defineShortcuts({
	v: () => navigateTo(linkToView(view.value === 'table' ? 'grid' : 'table')),
});
</script>

<template>
	<UFieldGroup role="group" aria-label="View">
		<UTooltip v-for="option in options" :key="option.value" :text="option.label" :kbds="['v']">
			<UButton
				:to="linkToView(option.value)"
				:icon="option.icon"
				:aria-label="`${option.label} view`"
				:aria-current="view === option.value ? 'true' : undefined"
				color="neutral"
				:variant="view === option.value ? 'solid' : 'subtle'"
				square
			/>
		</UTooltip>
	</UFieldGroup>
</template>
