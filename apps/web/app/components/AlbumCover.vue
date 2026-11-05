<script setup lang="ts">
import { cassetteColor, type CassetteColor } from '@luz/core';

// The size comes from the class the parent sets (e.g. `size-8`)
const props = defineProps<{
	album: string | null;
	artist: string | null;
}>();

// Written out in full so Tailwind finds every class. The 500 shades read on the light tile,
// the 400 ones on the dark tile; grey is lighter in the dark theme for the same reason.
const accents: Record<CassetteColor, string> = {
	red: 'text-red-500 dark:text-red-400',
	orange: 'text-orange-500 dark:text-orange-400',
	amber: 'text-amber-500 dark:text-amber-400',
	lime: 'text-lime-500 dark:text-lime-400',
	emerald: 'text-emerald-500 dark:text-emerald-400',
	teal: 'text-teal-500 dark:text-teal-400',
	cyan: 'text-cyan-500 dark:text-cyan-400',
	sky: 'text-sky-500 dark:text-sky-400',
	indigo: 'text-indigo-500 dark:text-indigo-400',
	violet: 'text-violet-500 dark:text-violet-400',
	fuchsia: 'text-fuchsia-500 dark:text-fuchsia-400',
	rose: 'text-rose-500 dark:text-rose-400',
	neutral: 'text-neutral-400 dark:text-neutral-500',
};

const color = computed(() => cassetteColor(props.album, props.artist));

// A 16 × 16 pixel cassette, as [x, y, width, height] rectangles
type Pixels = [number, number, number, number][];
const shell: Pixels = [
	[2, 3, 12, 1],
	[1, 4, 14, 8],
	[2, 12, 12, 1],
];
const label: Pixels = [[3, 4, 10, 5]];
const tape: Pixels = [
	[7, 5, 2, 3],
	[5, 6, 1, 1],
	[10, 6, 1, 1],
	[5, 11, 1, 1],
	[10, 11, 1, 1],
];
const reels: Pixels = [
	[4, 5, 3, 3],
	[9, 5, 3, 3],
];
const head: Pixels = [
	[4, 10, 8, 2],
	[3, 12, 10, 1],
];

function rect([x, y, width, height]: Pixels[number]) {
	return { x, y, width, height };
}
</script>

<template>
	<!-- Decorative: the album title always sits next to it -->
	<div
		class="aspect-square shrink-0 rounded-sm bg-elevated"
		:class="accents[color]"
		:data-color="color"
		aria-hidden="true"
	>
		<!-- One pixel of margin around the 16 × 16 drawing; a padding in % would follow the cell width -->
		<svg viewBox="-1 -1 18 18" class="size-full" shape-rendering="crispEdges">
			<rect v-for="(r, i) in shell" :key="`s${i}`" v-bind="rect(r)" fill="currentColor" />
			<rect
				v-for="(r, i) in head"
				:key="`h${i}`"
				v-bind="rect(r)"
				fill="black"
				opacity="0.2"
			/>
			<!-- Paper label and dark tape: the same in both themes, like a real cassette -->
			<rect v-for="(r, i) in label" :key="`l${i}`" v-bind="rect(r)" class="fill-neutral-50" />
			<rect
				v-for="(r, i) in reels"
				:key="`r${i}`"
				v-bind="rect(r)"
				class="fill-neutral-300"
			/>
			<rect v-for="(r, i) in tape" :key="`t${i}`" v-bind="rect(r)" class="fill-neutral-800" />
		</svg>
	</div>
</template>
