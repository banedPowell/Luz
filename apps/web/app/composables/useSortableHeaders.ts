import type { SortOrder } from '@luz/core';
import type { TableColumn } from '@nuxt/ui';
import { UButton } from '#components';
import type { MaybeRefOrGetter } from 'vue';

interface ListSort {
	sort: string;
	order: SortOrder;
}

/**
 * Column headers that sort a library list. Each header is a link, like the other list
 * controls, since the URL query holds the sort; the table only reflects it (manual
 * sorting), which also gives the header cells their `aria-sort`.
 */
export function useSortableHeaders<Row>(current: MaybeRefOrGetter<ListSort>) {
	const route = useRoute();
	const appConfig = useAppConfig();

	const sorting = computed(() => {
		const { sort, order } = toValue(current);
		return [{ id: sort, desc: order === 'desc' }];
	});

	// Clicking the sorted column reverses it; another column starts ascending, on page 1
	function linkFor(key: string) {
		const { sort, order } = toValue(current);
		const next = key === sort && order === 'asc' ? 'desc' : 'asc';
		return { query: { ...route.query, sort: key, order: next, page: undefined } };
	}

	function iconFor(key: string) {
		const { sort, order } = toValue(current);
		if (key !== sort) return undefined;
		return order === 'asc' ? appConfig.ui.icons.arrowUp : appConfig.ui.icons.arrowDown;
	}

	// TanStack only sorts a column with an accessor; the server sorts, so it reads nothing
	function sortable(label: string) {
		return {
			accessorFn: () => null,
			enableSorting: true,
			header: ({ column }) =>
				h(UButton, {
					label,
					to: linkFor(column.id),
					trailingIcon: iconFor(column.id),
					color: 'neutral',
					variant: 'ghost',
					class: '-mx-2.5 font-semibold',
				}),
		} satisfies Partial<TableColumn<Row>>;
	}

	return { sorting, sortable };
}
