<script setup lang="ts">
import type { ToolStatus } from '@luz/core';
import type { BadgeProps } from '@nuxt/ui';

const appConfig = useAppConfig();

const { data: tools, error, refresh } = await useFetch<ToolStatus[]>('/api/tools');

// The check runs at startup without blocking the server, so the page can open before it ends
const pollMs = 1000;
let timer: ReturnType<typeof setTimeout> | undefined;

function schedulePoll() {
	clearTimeout(timer);
	if (import.meta.client && tools.value?.some((tool) => tool.state === 'pending')) {
		timer = setTimeout(() => void refresh(), pollMs);
	}
}

watch(tools, schedulePoll);
onMounted(schedulePoll);
onBeforeUnmount(() => clearTimeout(timer));

const labels: Record<ToolStatus['tool'], string> = {
	'yt-dlp': 'yt-dlp',
	ffmpeg: 'FFmpeg',
	ffprobe: 'ffprobe',
};

const badges = computed<Record<ToolStatus['state'], BadgeProps>>(() => ({
	pending: { label: 'Checking', color: 'neutral', icon: appConfig.ui.icons.loading },
	available: { label: 'Available', color: 'success', icon: appConfig.ui.icons.success },
	unavailable: { label: 'Unavailable', color: 'error', icon: appConfig.ui.icons.error },
}));
</script>

<template>
	<section aria-labelledby="tools-title" class="flex flex-col gap-4">
		<div>
			<h2 id="tools-title" class="font-semibold text-highlighted">Tools</h2>
			<p class="text-sm text-muted">
				Downloads need these programs. Luz checks them when it starts; their paths come from
				the server configuration.
			</p>
		</div>

		<UAlert
			v-if="error"
			title="Could not load the tool status"
			color="error"
			variant="subtle"
			:icon="appConfig.ui.icons.error"
			:actions="[
				{ label: 'Retry', color: 'error', variant: 'outline', onClick: () => refresh() },
			]"
		/>

		<ul v-else-if="tools" class="flex flex-col divide-y divide-default">
			<li
				v-for="tool in tools"
				:key="tool.tool"
				class="flex flex-col gap-1 py-3 first:pt-0 last:pb-0"
			>
				<div class="flex flex-wrap items-center justify-between gap-2">
					<span class="font-medium text-highlighted">{{ labels[tool.tool] }}</span>
					<UBadge v-bind="badges[tool.state]" variant="subtle" />
				</div>
				<p v-if="tool.state === 'available' && tool.version" class="text-sm text-toned">
					Version {{ tool.version }}
				</p>
				<p v-else-if="tool.state === 'unavailable'" class="text-sm text-error">
					{{ tool.error }}
				</p>
				<p class="font-mono text-xs break-all text-muted">{{ tool.command }}</p>
			</li>
		</ul>
	</section>
</template>
