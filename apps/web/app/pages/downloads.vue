<script setup lang="ts">
import {
	analysisErrorMessages,
	analyzeRequestSchema,
	defaultOutputFormat,
	formatArtists,
	outputFormatLabels,
	outputFormats,
	type AnalysisErrorReason,
	type DownloadJob,
	type DownloadPreview,
	type OutputFormat,
	type PreviewItem,
	type ToolStatus,
} from '@luz/core';
import type { ButtonProps, SelectItem } from '@nuxt/ui';

import type { SelectAllState } from '~/composables/useListSelection';

interface AnalysisFailure {
	message: string;
	reason?: AnalysisErrorReason;
	details: string[];
}

const appConfig = useAppConfig();
const icons = appConfig.ui.icons;
const toast = useToast();
const { settings } = useSettings();

// A missing yt-dlp is known from the startup check (#16), before any analysis is tried
const { data: tools } = await useFetch<ToolStatus[]>('/api/tools');
const ytDlpMissing = computed(
	() => tools.value?.find((tool) => tool.tool === 'yt-dlp')?.state === 'unavailable',
);

const url = ref('');
const urlError = ref<string>();
const analyzing = ref(false);
const preview = ref<{ url: string; result: DownloadPreview }>();
const selected = ref(new Set<string>());

const failure = ref<AnalysisFailure>();

const outputFormat = ref<OutputFormat>(settings.value?.outputFormat ?? defaultOutputFormat);
const outputFormatItems = outputFormats.map((value) => ({
	value,
	label: outputFormatLabels[value],
})) satisfies (SelectItem & { value: OutputFormat })[];

// The extension of the source format depends on the codec yt-dlp downloads, unknown until then
const extension = computed(() => (outputFormat.value === 'source' ? '' : '.mp3'));

const settingsReasons = new Set<AnalysisErrorReason>(['library-path-unset', 'tool-unavailable']);

// Fixed in Settings, so the alert leads there
const failureActions = computed<ButtonProps[]>(() =>
	failure.value?.reason && settingsReasons.has(failure.value.reason)
		? [{ label: 'Open settings', to: '/settings', color: 'error', variant: 'outline' }]
		: [],
);

function isReason(value: unknown): value is AnalysisErrorReason {
	return typeof value === 'string' && value in analysisErrorMessages;
}

// The API names the reason and keeps the yt-dlp output in the error data (downloadHttpError)
function failureOf(error: unknown): AnalysisFailure {
	const data = (error as { data?: { data?: { reason?: unknown; details?: unknown } } }).data
		?.data;
	const reason = isReason(data?.reason) ? data.reason : undefined;
	const details = Array.isArray(data?.details)
		? data.details.filter((line): line is string => typeof line === 'string')
		: [];
	return {
		message: reason ? analysisErrorMessages[reason] : 'Luz could not analyse this address.',
		...(reason ? { reason } : {}),
		details,
	};
}

async function analyse() {
	const parsed = analyzeRequestSchema.safeParse({ url: url.value });
	if (!parsed.success) {
		urlError.value = parsed.error.issues[0]?.message;
		return;
	}
	urlError.value = undefined;
	failure.value = undefined;
	preview.value = undefined;
	analyzing.value = true;
	try {
		const result = await $fetch<DownloadPreview>('/api/downloads/analyze', {
			method: 'POST',
			body: parsed.data,
		});
		preview.value = { url: parsed.data.url, result };
		// A file already in the library would fail on its name, so it starts unchecked
		selected.value = new Set(
			result.items.filter((item) => !item.alreadyInLibrary).map((item) => item.sourceId),
		);
	} catch (error) {
		failure.value = failureOf(error);
	} finally {
		analyzing.value = false;
	}
}

const items = computed(() => preview.value?.result.items ?? []);

const allSelected = computed<SelectAllState>(() => {
	if (selected.value.size === 0) {
		return false;
	}
	return selected.value.size === items.value.length ? true : 'indeterminate';
});

function toggleAll(value: SelectAllState) {
	selected.value = new Set(value === true ? items.value.map((item) => item.sourceId) : []);
}

function toggle(item: PreviewItem, value: SelectAllState) {
	const next = new Set(selected.value);
	if (value === true) {
		next.add(item.sourceId);
	} else {
		next.delete(item.sourceId);
	}
	selected.value = next;
}

function itemTitle(item: PreviewItem): string {
	return item.tags.title ?? item.sourceId;
}

function itemArtists(item: PreviewItem): string {
	return formatArtists(item.tags.artists) ?? 'Unknown artist';
}

const downloading = ref(false);

async function download() {
	if (!preview.value || selected.value.size === 0) {
		return;
	}
	downloading.value = true;
	try {
		const job = await $fetch<DownloadJob>('/api/downloads', {
			method: 'POST',
			body: {
				url: preview.value.url,
				// In the order of the preview, which is the order the queue downloads them
				itemIds: items.value
					.filter((item) => selected.value.has(item.sourceId))
					.map((item) => item.sourceId),
				outputFormat: outputFormat.value,
			},
		});
		preview.value = undefined;
		selected.value = new Set();
		url.value = '';
		toast.add({
			title: 'Download queued',
			description: `${job.title}: ${job.itemCount} ${job.itemCount === 1 ? 'track' : 'tracks'}`,
			color: 'success',
			icon: icons.success,
		});
	} catch (error) {
		const { reason, message } = failureOf(error);
		toast.add({
			title: 'Could not start the download',
			description: reason
				? message
				: 'The preview is still here. Analyse the address again and retry.',
			color: 'error',
			icon: icons.error,
		});
	} finally {
		downloading.value = false;
	}
}
</script>

<template>
	<div class="mx-auto flex w-full max-w-360 flex-col gap-6">
		<form class="flex flex-col gap-3" novalidate @submit.prevent="analyse">
			<UFormField
				label="Address"
				description="A video, a track or a playlist, from YouTube or any site yt-dlp supports."
				:error="urlError"
			>
				<div class="flex flex-col gap-2 sm:flex-row">
					<UInput
						v-model="url"
						type="url"
						name="url"
						placeholder="Paste a web address"
						autocomplete="off"
						spellcheck="false"
						class="w-full"
					/>
					<UButton
						type="submit"
						label="Analyse"
						:icon="icons.search"
						:loading="analyzing"
						:disabled="ytDlpMissing"
						class="justify-center"
					/>
				</div>
			</UFormField>
		</form>

		<UAlert
			v-if="ytDlpMissing"
			title="yt-dlp is not available"
			description="Luz needs it to analyse and download. The Tools section of Settings says how to install it."
			color="warning"
			variant="subtle"
			:icon="icons.warning"
			:actions="[
				{ label: 'Open settings', to: '/settings', color: 'neutral', variant: 'outline' },
			]"
		/>

		<UAlert
			v-if="failure"
			:title="failure.message"
			color="error"
			variant="subtle"
			:icon="icons.error"
			:actions="failureActions"
		>
			<template v-if="failure.details.length > 0" #description>
				<UCollapsible class="mt-1">
					<UButton
						label="Show details"
						color="error"
						variant="link"
						:trailing-icon="icons.chevronDown"
						:ui="{
							trailingIcon: 'transition-transform group-data-[state=open]:rotate-180',
						}"
						class="group px-0"
					/>
					<template #content>
						<pre
							class="mt-2 max-h-64 overflow-auto font-mono text-xs whitespace-pre-wrap break-all text-toned"
							>{{ failure.details.join('\n') }}</pre>
					</template>
				</UCollapsible>
			</template>
		</UAlert>

		<section v-if="preview" aria-labelledby="preview-title" class="flex flex-col gap-4">
			<div class="flex flex-col gap-1">
				<h2 id="preview-title" class="font-semibold text-highlighted">
					{{ preview.result.title }}
				</h2>
				<p class="text-sm text-muted">
					{{ preview.result.kind === 'playlist' ? 'Playlist' : 'Track' }},
					{{ items.length }} {{ items.length === 1 ? 'file' : 'files' }}.
					<template v-if="outputFormat === 'source'">
						Paths are shown without their extension, which follows the source audio.
					</template>
				</p>
			</div>

			<UEmpty
				v-if="items.length === 0"
				icon="i-pixelarticons-download"
				title="Nothing to download"
				description="This playlist has no track yt-dlp could read."
				variant="naked"
			/>

			<template v-else>
				<div class="flex items-center gap-3 border-b border-default px-2 pb-2">
					<SelectCheckbox
						:model-value="allSelected"
						label="Select all files"
						@update:model-value="toggleAll"
					/>
					<span class="text-sm text-muted"
						>{{ selected.size }} of {{ items.length }} selected</span
					>
				</div>
				<ul class="flex flex-col divide-y divide-default" aria-label="Files to download">
					<li
						v-for="item in items"
						:key="item.sourceId"
						class="flex items-start gap-3 px-2 py-2"
					>
						<SelectCheckbox
							:model-value="selected.has(item.sourceId)"
							:label="`Select ${itemTitle(item)}`"
							class="mt-0.5"
							@update:model-value="(value) => toggle(item, value)"
						/>
						<div class="flex min-w-0 flex-1 flex-col gap-0.5">
							<div class="flex min-w-0 flex-wrap items-center gap-x-2">
								<span
									class="truncate font-medium text-highlighted"
									:title="itemTitle(item)"
								>
									{{ itemTitle(item) }}
								</span>
								<UBadge
									v-if="item.alreadyInLibrary"
									label="Already in library"
									color="warning"
									variant="subtle"
									size="sm"
								/>
							</div>
							<span class="truncate text-sm text-muted">{{ itemArtists(item) }}</span>
							<span class="font-mono text-xs break-all text-toned">
								{{ item.pathWithoutExtension }}{{ extension }}
							</span>
						</div>
					</li>
				</ul>
			</template>

			<div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
				<UFormField label="Format">
					<USelect
						v-model="outputFormat"
						:items="outputFormatItems"
						class="w-full sm:w-56"
					/>
				</UFormField>
				<UButton
					label="Download"
					icon="i-pixelarticons-download"
					:loading="downloading"
					:disabled="selected.size === 0"
					class="justify-center"
					@click="download"
				/>
			</div>
		</section>
	</div>
</template>
