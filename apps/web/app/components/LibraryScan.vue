<script setup lang="ts">
import type { ScanFailure } from '~/composables/useLibraryScan';

defineProps<{
	musicLibraryPath: string;
}>();

const appConfig = useAppConfig();
const { scanning, summary, failure, scan } = useLibraryScan();

const failureMessages: Record<ScanFailure, string> = {
	'library-path-unset': 'No music library folder is set.',
	'library-path-missing':
		'The music library folder does not exist. Check the path in the settings.',
	'scan-running': 'A scan is already running. Try again once it is done.',
	unknown: 'The scan failed. Try again later.',
};
</script>

<template>
	<div class="flex flex-col gap-4">
		<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
			<div class="min-w-0">
				<h2 class="font-semibold text-highlighted">Music folder</h2>
				<p class="text-sm break-all text-muted">{{ musicLibraryPath }}</p>
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
			:description="`${plural(summary.added, 'track')} added, ${summary.updated} updated, ${summary.removed} removed, ${summary.unchanged} unchanged, ${plural(summary.skipped, 'file')} skipped.`"
			color="success"
			variant="subtle"
			:icon="appConfig.ui.icons.success"
		/>
	</div>
</template>
