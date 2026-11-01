import type { LocationQueryRaw } from 'vue-router';

// The part of a Zod schema used here; the app does not depend on Zod itself
interface QuerySchema<Query> {
	parse(value: unknown): Query;
	safeParse(value: unknown): { success: true; data: Query } | { success: false };
}

/**
 * The sort and page of a library list, kept in the URL query so a view can be reloaded
 * or shared. A query the schema rejects falls back to the defaults rather than an error.
 */
export function useListQuery<Query extends { page: number }>(schema: QuerySchema<Query>) {
	const route = useRoute();

	const query = computed<Query>(() => {
		const parsed = schema.safeParse(route.query);
		return parsed.success ? parsed.data : schema.parse({});
	});

	function linkTo(patch: LocationQueryRaw) {
		return { query: { ...route.query, ...patch } };
	}

	return { query, linkTo };
}
