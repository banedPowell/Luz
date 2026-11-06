<script setup lang="ts">
import {
	formatArtists,
	isActiveState,
	itemStepLabel,
	jobProgressPercent,
	remainingItemCount,
	type DownloadItem,
	type DownloadJob,
	type DownloadState,
} from '@luz/core';
import type { BadgeProps } from '@nuxt/ui';

const appConfig = useAppConfig();
const icons = appConfig.ui.icons;
const toast = useToast();
const { jobs, loaded, cancel } = useDownloads();

const stateBadges: Record<Exclude<DownloadState, 'running'>, BadgeProps> = {
	queued: { label: 'Queued', color: 'neutral' },
	completed: { label: 'Completed', color: 'success' },
	failed: { label: 'Failed', color: 'error' },
	cancelled: { label: 'Cancelled', color: 'neutral' },
};

function counts(job: DownloadJob): string {
	const remaining = remainingItemCount(job);
	const cancelled = job.itemCount - job.completedCount - job.failedCount - remaining;
	return [
		`${job.completedCount} done`,
		`${job.failedCount} failed`,
		remaining > 0 || isActiveState(job.state) ? `${remaining} remaining` : undefined,
		cancelled > 0 ? `${cancelled} cancelled` : undefined,
	]
		.filter((part) => part !== undefined)
		.join(' · ');
}

// Completed and queued items are in the counts: a long playlist would otherwise be a long list
function shownItems(job: DownloadJob): DownloadItem[] {
	return job.items.filter((item) => item.state === 'running' || item.state === 'failed');
}

function itemArtists(item: DownloadItem): string | null {
	return formatArtists(item.tags.artists);
}

function stepOf(item: DownloadItem, job: DownloadJob): string {
	const step = itemStepLabel(item, job);
	return item.step === 'downloading' && item.progressPercent !== undefined
		? `${step}, ${item.progressPercent}%`
		: step;
}

const confirming = ref<DownloadJob>();
const cancelling = ref(false);

const confirmOpen = computed({
	get: () => confirming.value !== undefined,
	set: (open) => {
		if (!open) {
			confirming.value = undefined;
		}
	},
});

async function confirmCancel() {
	const job = confirming.value;
	if (!job) {
		return;
	}
	cancelling.value = true;
	try {
		await cancel(job.id);
		confirming.value = undefined;
	} catch {
		confirming.value = undefined;
		toast.add({
			title: 'Could not cancel the download',
			description: 'It may have ended in the meantime. The queue shows where it is now.',
			color: 'error',
			icon: icons.error,
		});
	} finally {
		cancelling.value = false;
	}
}
</script>

<template>
	<section aria-labelledby="queue-title" class="flex flex-col gap-3">
		<h2 id="queue-title" class="font-semibold text-highlighted">Queue</h2>

		<p v-if="loaded && jobs.length === 0" class="text-sm text-muted">
			No downloads yet. Analyse an address above to start one.
		</p>

		<ul v-else class="flex flex-col gap-3" aria-label="Downloads">
			<li
				v-for="job in jobs"
				:key="job.id"
				class="flex flex-col gap-3 rounded-md p-3 ring ring-default"
				:aria-label="job.title"
			>
				<div class="flex items-start gap-3">
					<div class="flex min-w-0 flex-1 flex-col gap-1">
						<div class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
							<span class="truncate font-medium text-highlighted" :title="job.title">
								{{ job.title }}
							</span>
							<UBadge
								v-if="job.state !== 'running'"
								v-bind="stateBadges[job.state]"
								variant="subtle"
								size="sm"
							/>
						</div>
						<p class="text-sm text-muted">{{ counts(job) }}</p>
					</div>
					<UButton
						v-if="isActiveState(job.state)"
						label="Cancel"
						color="neutral"
						variant="outline"
						:aria-label="`Cancel ${job.title}`"
						class="h-10 shrink-0 md:h-8"
						@click="confirming = job"
					/>
				</div>

				<UProgress
					:model-value="jobProgressPercent(job)"
					size="sm"
					:aria-label="`${job.title}: ${jobProgressPercent(job)}%`"
				/>

				<p v-if="job.error" class="text-sm text-error">{{ job.error.message }}</p>

				<ul
					v-if="shownItems(job).length > 0"
					class="flex flex-col divide-y divide-default"
					:aria-label="`Files of ${job.title}`"
				>
					<li
						v-for="item in shownItems(job)"
						:key="item.id"
						class="flex flex-col gap-1.5 py-2 first:pt-0 last:pb-0"
					>
						<div class="flex min-w-0 flex-wrap items-baseline gap-x-2">
							<span
								class="truncate text-sm font-medium text-highlighted"
								:title="item.title"
							>
								{{ item.title }}
							</span>
							<span v-if="itemArtists(item)" class="truncate text-sm text-muted">
								{{ itemArtists(item) }}
							</span>
						</div>

						<template v-if="item.state === 'running'">
							<UProgress
								:model-value="
									item.step === 'downloading' ? (item.progressPercent ?? 0) : null
								"
								size="sm"
								:aria-label="`${item.title}: ${stepOf(item, job)}`"
							/>
							<p class="text-xs text-muted" aria-live="polite">
								{{ stepOf(item, job) }}
							</p>
						</template>

						<p v-else-if="item.error" class="text-sm text-error">
							{{ item.error.message }}
						</p>

						<UCollapsible v-if="item.log.length > 0">
							<UButton
								label="Show details"
								color="neutral"
								variant="link"
								size="sm"
								:trailing-icon="icons.chevronDown"
								:ui="{
									trailingIcon:
										'transition-transform group-data-[state=open]:rotate-180',
								}"
								class="group px-0"
							/>
							<template #content>
								<pre
									class="mt-1 max-h-64 overflow-auto font-mono text-xs whitespace-pre-wrap break-all text-toned"
									>{{ item.log.join('\n') }}</pre>
							</template>
						</UCollapsible>
					</li>
				</ul>
			</li>
		</ul>

		<UModal
			v-model:open="confirmOpen"
			title="Cancel this download?"
			:description="
				confirming
					? `${confirming.title}: the files not downloaded yet are dropped. Tracks already in your library stay there.`
					: undefined
			"
		>
			<template #footer>
				<div class="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
					<UButton
						label="Keep downloading"
						color="neutral"
						variant="outline"
						class="h-10 justify-center md:h-8"
						@click="confirming = undefined"
					/>
					<UButton
						label="Cancel download"
						color="error"
						:loading="cancelling"
						class="h-10 justify-center md:h-8"
						@click="confirmCancel"
					/>
				</div>
			</template>
		</UModal>
	</section>
</template>
