import { defaultListView, listViewQuerySchema, type ListView } from '@luz/core';

/**
 * Whether a library list is drawn as a table or a grid, kept in the URL query next to the
 * sort and the page so a reload or a shared link shows the same view.
 */
export function useListView() {
	const route = useRoute();

	const view = computed<ListView>(() => listViewQuerySchema.parse(route.query).view);

	// The default stays out of the URL, like the other defaults of a list
	function linkToView(target: ListView) {
		return {
			query: { ...route.query, view: target === defaultListView ? undefined : target },
		};
	}

	return { view, linkToView };
}
