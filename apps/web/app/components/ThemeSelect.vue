<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui';

type ThemePreference = 'system' | 'light' | 'dark';

const { collapsed = false } = defineProps<{
	collapsed?: boolean;
}>();

const colorMode = useColorMode();
const appConfig = useAppConfig();

const options = computed(
	() =>
		[
			{ value: 'system', label: 'System', icon: appConfig.ui.icons.system },
			{ value: 'light', label: 'Light', icon: appConfig.ui.icons.light },
			{ value: 'dark', label: 'Dark', icon: appConfig.ui.icons.dark },
		] satisfies { value: ThemePreference; label: string; icon: string }[],
);

const current = computed(
	() => options.value.find((option) => option.value === colorMode.preference) ?? options.value[0],
);

// Checkbox items rather than a select: the trigger has to fit the collapsed
// sidebar, and the menu still marks the active choice for assistive tech.
const items = computed<DropdownMenuItem[]>(() =>
	options.value.map((option) => ({
		label: option.label,
		icon: option.icon,
		type: 'checkbox',
		checked: option.value === colorMode.preference,
		onSelect: () => {
			colorMode.preference = option.value;
		},
	})),
);
</script>

<template>
	<!-- The preference is only known on the client, so avoid a hydration mismatch -->
	<ClientOnly>
		<UDropdownMenu :items="items" :content="{ side: 'top', align: 'start' }">
			<UButton
				:icon="current?.icon"
				:label="collapsed ? undefined : `Theme: ${current?.label}`"
				:aria-label="`Theme: ${current?.label}`"
				color="neutral"
				variant="ghost"
				:block="!collapsed"
				:square="collapsed"
				:class="collapsed ? undefined : 'justify-start'"
			/>
		</UDropdownMenu>
		<template #fallback>
			<div class="h-8" />
		</template>
	</ClientOnly>
</template>
