<script setup lang="ts">
import type { SelectAllState } from '~/composables/useListSelection';

defineProps<{
	// Screen readers only: the row or list says what is selected
	label: string;
}>();

const checked = defineModel<SelectAllState>({ required: true });
</script>

<template>
	<!-- The box stays small; a pseudo-element widens what a finger can hit to 40 px (32 px from md) -->
	<UCheckbox
		v-model="checked"
		:aria-label="label"
		:ui="{
			root: 'items-center',
			base: 'relative overflow-visible after:absolute after:-inset-3 md:after:-inset-2',
			indicator: 'rounded-sm',
		}"
	/>
</template>
