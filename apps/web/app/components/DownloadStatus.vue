<script setup lang="ts">
const { variant = 'sidebar', collapsed = false } = defineProps<{
	// 'bar' is the compact form of the top bar, where narrow screens keep it in view
	variant?: 'sidebar' | 'bar';
	collapsed?: boolean;
}>();

const { active } = useDownloads();

const summary = computed(() => {
	if (!active.value) {
		return undefined;
	}
	const { jobCount, percent } = active.value;
	return `${jobCount} ${jobCount === 1 ? 'download' : 'downloads'}, ${percent}%`;
});
</script>

<template>
	<!-- Drawn only while something is queued or running (no placeholder controls) -->
	<template v-if="active && summary">
		<UTooltip
			v-if="variant === 'sidebar' && collapsed"
			:text="summary"
			:content="{ side: 'right' }"
		>
			<UButton
				to="/downloads"
				icon="i-pixelarticons-download"
				color="neutral"
				variant="ghost"
				square
				:aria-label="summary"
				class="text-muted"
			/>
		</UTooltip>

		<NuxtLink
			v-else-if="variant === 'sidebar'"
			to="/downloads"
			:aria-label="summary"
			class="flex flex-col gap-1.5 rounded-md p-1.5 text-sm hover:bg-elevated focus-visible:outline-2 focus-visible:outline-primary"
		>
			<span class="flex items-center gap-1.5 text-highlighted">
				<UIcon name="i-pixelarticons-download" class="size-5 shrink-0" />
				<span class="flex-1 truncate">
					{{ active.jobCount }} {{ active.jobCount === 1 ? 'download' : 'downloads' }}
				</span>
				<span class="text-muted tabular-nums">{{ active.percent }}%</span>
			</span>
			<UProgress :model-value="active.percent" size="sm" aria-hidden="true" />
		</NuxtLink>

		<UButton
			v-else
			to="/downloads"
			icon="i-pixelarticons-download"
			:label="`${active.percent}%`"
			color="neutral"
			variant="ghost"
			:aria-label="summary"
			class="h-10 shrink-0 tabular-nums"
		/>
	</template>
</template>
