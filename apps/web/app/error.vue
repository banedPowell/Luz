<script setup lang="ts">
import type { NuxtError } from '#app';

defineProps<{ error: NuxtError }>();
</script>

<template>
	<!-- The page lives in a component so tests can import it from #components -->
	<ErrorPage :error="error" />
</template>
