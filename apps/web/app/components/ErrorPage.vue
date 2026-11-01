<script setup lang="ts">
import type { NuxtError } from '#app';

const props = defineProps<{ error: NuxtError }>();

const notFound = computed(() => props.error.status === 404);

// Fixed wording on purpose: the error's own message and stack can expose server internals
const display = computed(() =>
	notFound.value
		? {
				title: 'Page not found',
				message: 'The page you are looking for does not exist or has moved.',
			}
		: {
				title: 'Something went wrong',
				message: 'An unexpected error occurred. Go back to Home and try again.',
			},
);
</script>

<template>
	<UApp>
		<NuxtLayout :title="display.title">
			<!-- The layout already provides the <main> landmark and the page <h1> -->
			<UError
				:as="{ root: 'div', statusMessage: 'h2' }"
				:error="{
					status: error.status,
					statusText: display.title,
					message: display.message,
				}"
				redirect="/"
				:clear="{ label: 'Back to Home', icon: 'i-pixelarticons-home' }"
				:ui="{ statusMessage: 'text-2xl sm:text-3xl' }"
				class="h-full min-h-0"
			/>
		</NuxtLayout>
	</UApp>
</template>
