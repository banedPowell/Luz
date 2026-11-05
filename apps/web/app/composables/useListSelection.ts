import type { MaybeRefOrGetter } from 'vue';

/** The state of a "select all" checkbox. */
export type SelectAllState = boolean | 'indeterminate';

interface Row {
	id: number;
}

/**
 * The rows checked in a library list, by id, for the selection bar. Only rows on screen
 * stay checked: a new page, sort or view clears the selection, so an action never applies
 * to rows the user can no longer see. A page with several tables (an artist's albums)
 * shares one selection, and each table checks its own rows with `allOf` and `toggleAllOf`.
 */
export function useListSelection(items: MaybeRefOrGetter<readonly Row[]>) {
	const route = useRoute();
	const selected = ref<ReadonlySet<number>>(new Set());

	const ids = computed(() => [...selected.value]);
	const count = computed(() => selected.value.size);

	function allOf(rows: readonly Row[]): SelectAllState {
		const checked = rows.filter((row) => selected.value.has(row.id)).length;
		if (checked === 0) {
			return false;
		}
		return checked === rows.length ? true : 'indeterminate';
	}

	const all = computed(() => allOf(toValue(items)));

	function isSelected(id: number): boolean {
		return selected.value.has(id);
	}

	function toggleAllOf(rows: readonly Row[], value: SelectAllState) {
		const next = new Set(selected.value);
		for (const row of rows) {
			if (value === true) {
				next.add(row.id);
			} else {
				next.delete(row.id);
			}
		}
		selected.value = next;
	}

	function toggle(id: number, value: SelectAllState) {
		toggleAllOf([{ id }], value);
	}

	function toggleAll(value: SelectAllState) {
		toggleAllOf(toValue(items), value);
	}

	function clear() {
		selected.value = new Set();
	}

	// The page, sort and view sit in the URL query
	watch(() => route.fullPath, clear);
	// A refresh can drop rows (a rescan that removed a track): forget them
	watch(
		() => toValue(items),
		(rows) => {
			const present = new Set(rows.map((row) => row.id));
			if (ids.value.some((id) => !present.has(id))) {
				selected.value = new Set(ids.value.filter((id) => present.has(id)));
			}
		},
	);

	return { ids, count, all, allOf, isSelected, toggle, toggleAll, toggleAllOf, clear };
}

export type ListSelection = ReturnType<typeof useListSelection>;
