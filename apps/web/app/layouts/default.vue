<script setup lang="ts">
const props = defineProps<{
	// Set by error.vue: an unknown or failing route has no navigation entry to name it
	title?: string;
}>();

const route = useRoute();
const open = ref(true);

const title = computed(() => props.title ?? findNavigationEntry(route.path)?.label ?? 'Luz');

useHead({ titleTemplate: (page) => (page ? `${page} · Luz` : 'Luz') });
useSeoMeta({ title });

// Below the sidebar breakpoint (lg) the sidebar is an overlay menu: close it
// once a link is followed. On desktop the user's collapse choice is kept.
watch(
	() => route.path,
	() => {
		if (!window.matchMedia('(min-width: 64rem)').matches) {
			open.value = false;
		}
	},
);
</script>

<template>
	<div class="flex min-h-svh flex-1 bg-muted">
		<!-- First focusable element, so keyboard users can bypass the sidebar (WCAG 2.4.1) -->
		<a
			href="#main"
			class="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-default focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-highlighted focus:shadow-lg focus:ring focus:ring-default focus-visible:outline-2 focus-visible:outline-primary"
		>
			Skip to content
		</a>

		<USidebar
			v-model:open="open"
			variant="inset"
			collapsible="icon"
			rail
			:ui="{ container: 'h-full' }"
		>
			<template #header="{ state }">
				<NuxtLink
					to="/"
					class="flex items-center gap-2 rounded-md px-1.5 font-semibold text-highlighted focus-visible:outline-2 focus-visible:outline-primary"
				>
					<UIcon name="i-pixelarticons-music" class="size-5 shrink-0" />
					<span v-if="state === 'expanded'" class="truncate">Luz</span>
					<span v-else class="sr-only">Luz</span>
				</NuxtLink>
			</template>

			<template #default="{ state }">
				<AppNavigation :collapsed="state === 'collapsed'" />
			</template>

			<template #footer="{ state }">
				<ThemeSelect :collapsed="state === 'collapsed'" class="w-full" />
			</template>
		</USidebar>

		<div
			class="flex flex-1 flex-col overflow-hidden bg-default lg:peer-data-[variant=inset]:m-4 lg:peer-data-[variant=inset]:not-peer-data-[collapsible=offcanvas]:ms-0 lg:peer-data-[variant=inset]:rounded-xl lg:peer-data-[variant=inset]:shadow-sm lg:peer-data-[variant=inset]:ring lg:peer-data-[variant=inset]:ring-default"
		>
			<header
				class="flex h-(--ui-header-height) shrink-0 items-center gap-3 border-b border-default px-4"
			>
				<UButton
					icon="i-pixelarticons-layout-sidebar-left"
					color="neutral"
					variant="ghost"
					:aria-label="open ? 'Close sidebar' : 'Open sidebar'"
					:aria-expanded="open"
					@click="open = !open"
				/>
				<h1 class="flex-1 truncate text-lg font-semibold text-highlighted">{{ title }}</h1>
			</header>
			<!-- tabindex="-1" lets the skip link move focus here, not only scroll -->
			<main
				id="main"
				tabindex="-1"
				class="flex-1 overflow-auto p-4 focus:outline-none md:p-6"
			>
				<slot />
			</main>
		</div>
	</div>
</template>
