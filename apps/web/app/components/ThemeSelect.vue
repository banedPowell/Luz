<script setup lang="ts">
import type { Theme } from '@luz/core';

const { collapsed = false } = defineProps<{
	collapsed?: boolean;
}>();

const colorMode = useColorMode();
const appConfig = useAppConfig();

const options = computed(
	() =>
		[
			{ value: 'light', label: 'Light', icon: appConfig.ui.icons.light },
			{ value: 'dark', label: 'Dark', icon: appConfig.ui.icons.dark },
			{ value: 'system', label: 'System', icon: appConfig.ui.icons.system },
		] satisfies { value: Theme; label: string; icon: string }[],
);

// Kept by color-mode in its cookie, in this browser only (ADR 0006)
function choose(theme: Theme) {
	colorMode.preference = theme;
}
</script>

<template>
	<!-- The preference is only known on the client, so avoid a hydration mismatch -->
	<ClientOnly>
		<!-- Toggle buttons rather than a radio group: each one is a tab stop and a plain
		     click, and aria-pressed tells assistive tech which theme is active -->
		<div
			role="group"
			aria-label="Theme"
			class="inline-flex w-fit gap-0.5 rounded-full bg-elevated p-0.5 ring ring-default"
			:class="collapsed ? 'flex-col' : 'flex-row'"
		>
			<UTooltip
				v-for="option in options"
				:key="option.value"
				:text="option.label"
				:content="{ side: collapsed ? 'right' : 'top' }"
			>
				<UButton
					:icon="option.icon"
					:aria-label="`${option.label} theme`"
					:aria-pressed="colorMode.preference === option.value"
					color="neutral"
					variant="ghost"
					square
					class="rounded-full max-lg:p-2.5"
					:class="
						colorMode.preference === option.value
							? 'bg-default text-highlighted shadow-xs ring ring-default hover:bg-default'
							: 'text-muted hover:text-highlighted'
					"
					@click="choose(option.value)"
				/>
			</UTooltip>
		</div>
		<template #fallback>
			<!-- Same footprint as the pill, so the sidebar does not shift on hydration -->
			<div :class="collapsed ? 'h-24 w-9' : 'h-9 w-24'" />
		</template>
	</ClientOnly>
</template>
