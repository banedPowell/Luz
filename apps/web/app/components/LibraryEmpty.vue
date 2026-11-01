<script setup lang="ts">
const appConfig = useAppConfig();
const { scanning, scan } = useLibraryScan();
</script>

<template>
	<UEmpty
		icon="i-pixelarticons-library"
		title="Your library is empty"
		description="Scan your music folder to list the tracks, albums and artists it holds."
		variant="naked"
		:actions="[
			{
				label: 'Scan library',
				icon: appConfig.ui.icons.reload,
				loading: scanning,
				onClick: scan,
			},
		]"
	/>
</template>
