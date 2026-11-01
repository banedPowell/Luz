<script setup lang="ts">
import { maxSearchQueryLength } from '@luz/core';

const searchPath = '/library/search';
// Long enough not to fetch on every key, short enough to feel immediate
const searchDelayMs = 300;

const route = useRoute();
const router = useRouter();
const appConfig = useAppConfig();

const onSearchPage = computed(() => route.path === searchPath);
// The query of the URL is the search; the field follows it on back and forward
const routeQuery = computed(() =>
	onSearchPage.value && typeof route.query.q === 'string' ? route.query.q : '',
);
const text = ref(routeQuery.value);

let timer: ReturnType<typeof setTimeout> | undefined;
// The view the search was started from, where clearing the field goes back to
let origin = '/library';

function cancel() {
	clearTimeout(timer);
	timer = undefined;
}

// One history entry per search from another view, then the URL is replaced while typing
function search() {
	cancel();
	const q = text.value.trim();
	if (onSearchPage.value ? q === routeQuery.value : q === '') {
		return;
	}
	if (!onSearchPage.value) {
		origin = route.fullPath;
		return navigateTo({ path: searchPath, query: { q } });
	}
	if (q === '') {
		// Back rather than forward when the search has its own history entry, so the
		// back button does not land on the same view twice
		if (router.options.history.state.back === origin) {
			return router.back();
		}
		return navigateTo(origin, { replace: true });
	}
	return navigateTo({ path: searchPath, query: { q } }, { replace: true });
}

watch(text, () => {
	cancel();
	timer = setTimeout(search, searchDelayMs);
});

// Leaving the search for another view clears the field; trailing spaces being typed stay
watch(routeQuery, (q) => {
	if (q !== text.value.trim()) {
		text.value = q;
	}
});

onBeforeUnmount(cancel);
</script>

<template>
	<form role="search" aria-label="Library" @submit.prevent="search">
		<UInput
			v-model="text"
			type="search"
			:icon="appConfig.ui.icons.search"
			placeholder="Search tracks, albums, artists"
			aria-label="Search the library"
			:maxlength="maxSearchQueryLength"
			autocomplete="off"
			class="w-full"
		/>
	</form>
</template>
