<script setup lang="ts">
import { isScanErrorReason, type ScanErrorReason, type ScanSummary } from '@luz/core';

const { settings } = useSettings();
const appConfig = useAppConfig();

const scanning = ref(false);
const summary = ref<ScanSummary>();
const failure = ref<ScanErrorReason | 'unknown'>();

// Loaded during server rendering (plugins/settings.server.ts); a scan refused for a
// missing path also lands here, in case the settings changed in another tab
const pathUnset = computed(
	() => !settings.value?.musicLibraryPath || failure.value === 'library-path-unset',
);

const failureMessages: Record<ScanErrorReason | 'unknown', string> = {
	'library-path-unset': 'No music library folder is set.',
	'library-path-missing':
		'The music library folder does not exist. Check the path in the settings.',
	'scan-running': 'A scan is already running. Try again once it is done.',
	unknown: 'The scan failed. Try again later.',
};

function field(value: unknown, key: string): unknown {
	return typeof value === 'object' && value !== null ? Reflect.get(value, key) : undefined;
}

// The API sends the reason in the error data; never show the server's own message
function reasonOf(error: unknown): ScanErrorReason | 'unknown' {
	const reason = field(field(field(error, 'data'), 'data'), 'reason');
	return isScanErrorReason(reason) ? reason : 'unknown';
}

async function scan() {
	scanning.value = true;
	failure.value = undefined;
	try {
		summary.value = await $fetch<ScanSummary>('/api/library/scan', { method: 'POST' });
	} catch (error) {
		failure.value = reasonOf(error);
	} finally {
		scanning.value = false;
	}
}

function plural(count: number, word: string): string {
	return `${count} ${word}${count === 1 ? '' : 's'}`;
}
</script>

<template>
	<UEmpty
		v-if="pathUnset"
		icon="i-pixelarticons-library"
		title="No music folder yet"
		description="Choose the folder that holds your music in the settings, then scan it."
		variant="naked"
		class="h-full"
		:actions="[{ label: 'Open settings', to: '/settings', icon: appConfig.ui.icons.folder }]"
	/>

	<div v-else class="mx-auto flex w-full max-w-2xl flex-col gap-6">
		<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
			<div class="min-w-0">
				<h2 class="font-semibold text-highlighted">Music folder</h2>
				<p class="text-sm break-all text-muted">{{ settings?.musicLibraryPath }}</p>
			</div>
			<UButton
				label="Scan library"
				:icon="appConfig.ui.icons.reload"
				:loading="scanning"
				class="self-start sm:self-auto"
				@click="scan"
			/>
		</div>

		<p v-if="scanning" role="status" class="text-sm text-muted">
			Scanning your music folder. Files are only read, never changed.
		</p>

		<UAlert
			v-else-if="failure"
			title="Could not scan the library"
			:description="failureMessages[failure]"
			color="error"
			variant="subtle"
			:icon="appConfig.ui.icons.error"
			:actions="
				failure === 'library-path-missing'
					? [
							{
								label: 'Open settings',
								to: '/settings',
								color: 'error',
								variant: 'outline',
							},
						]
					: undefined
			"
		/>

		<UAlert
			v-else-if="summary"
			role="status"
			title="Scan complete"
			:description="`${plural(summary.filesFound, 'audio file')} found, ${plural(summary.tracksIndexed, 'track')} indexed, ${plural(summary.filesSkipped, 'file')} skipped.`"
			color="success"
			variant="subtle"
			:icon="appConfig.ui.icons.success"
		/>

		<p v-else class="text-sm text-muted">
			Scan the folder to build your library from the files already on your disk.
		</p>
	</div>
</template>
