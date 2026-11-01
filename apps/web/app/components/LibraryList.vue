<script setup lang="ts">
import type { SortOrder } from '@luz/core';

const props = defineProps<{
	// Already pluralised, e.g. "12 albums"
	count: string;
	total: number;
	page: number;
	pageSize: number;
	// Validated by the page's query schema
	sort: string;
	order: SortOrder;
	sortOptions: { label: string; value: string }[];
}>();

const route = useRoute();
const appConfig = useAppConfig();

// Every control is a navigation: the URL query holds the sort and the page
function linkTo(patch: Record<string, string | number | undefined>) {
	return { query: { ...route.query, ...patch } };
}

// A new sort starts again from the first page
function changeSort(sort: string) {
	return navigateTo(linkTo({ sort, page: undefined }));
}

const nextOrder = computed<SortOrder>(() => (props.order === 'asc' ? 'desc' : 'asc'));
</script>

<template>
	<div class="flex flex-col gap-4">
		<div class="flex flex-wrap items-center justify-between gap-3">
			<p class="text-sm text-muted">{{ count }}</p>
			<div class="flex items-center gap-2">
				<USelect
					:model-value="sort"
					:items="sortOptions"
					aria-label="Sort by"
					class="w-36"
					@update:model-value="changeSort"
				/>
				<UButton
					:to="linkTo({ order: nextOrder, page: undefined })"
					:icon="
						order === 'asc' ? appConfig.ui.icons.arrowUp : appConfig.ui.icons.arrowDown
					"
					:label="order === 'asc' ? 'Ascending' : 'Descending'"
					:aria-label="`Sort order: ${order === 'asc' ? 'ascending' : 'descending'}. Reverse it`"
					color="neutral"
					variant="subtle"
				/>
			</div>
		</div>

		<slot />

		<UPagination
			v-if="total > pageSize"
			:page="page"
			:total="total"
			:items-per-page="pageSize"
			:to="(target: number) => linkTo({ page: target })"
			class="self-center"
		/>
	</div>
</template>
