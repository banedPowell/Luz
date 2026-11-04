<script setup lang="ts">
import {
	formatBitDepth,
	formatBitrate,
	formatChannels,
	formatDuration,
	formatFileSize,
	formatSampleRate,
	type TrackDetail,
} from '@luz/core';

const props = defineProps<{ id: number }>();

// Fetched when the details open, not with every row of a list
const { data: track, error } = await useFetch<TrackDetail>(`/api/library/tracks/${props.id}`, {
	key: `track-${props.id}`,
	lazy: true,
	server: false,
});

interface Entry {
	label: string;
	value: string | null;
	// Shown, muted, when there is no value; without it the entry is left out
	missing?: string;
	mono?: boolean;
}

interface Section {
	title: string;
	entries: Entry[];
}

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

function formatOf(detail: TrackDetail): string | null {
	if (detail.codec === null) {
		return null;
	}
	return detail.codecProfile ? `${detail.codec} (${detail.codecProfile})` : detail.codec;
}

function numberOrNull(value: number | null): string | null {
	return value === null ? null : String(value);
}

const sections = computed<Section[]>(() => {
	const detail = track.value;
	if (!detail) {
		return [];
	}
	const all: Section[] = [
		{
			title: 'Audio',
			entries: [
				{ label: 'Format', value: formatOf(detail), missing: 'Unknown' },
				{
					label: 'Quality',
					value: detail.lossless === null ? null : detail.lossless ? 'Lossless' : 'Lossy',
				},
				{ label: 'Bitrate', value: formatBitrate(detail.bitrate) },
				{ label: 'Sample rate', value: formatSampleRate(detail.sampleRate) },
				{ label: 'Bit depth', value: formatBitDepth(detail.bitDepth) },
				{ label: 'Channels', value: formatChannels(detail.channels) },
				{ label: 'Duration', value: formatDuration(detail.durationMs), missing: 'Unknown' },
			],
		},
		{
			title: 'Tags',
			entries: [
				{ label: 'Title', value: detail.title, missing: 'Not tagged' },
				{ label: 'Artists', value: detail.artists, missing: 'Not tagged' },
				{ label: 'Album', value: detail.album.title, missing: 'Not tagged' },
				{ label: 'Album artist', value: detail.artist.name, missing: 'Not tagged' },
				{ label: 'Track', value: numberOrNull(detail.trackNumber), missing: 'Not tagged' },
				{ label: 'Disc', value: numberOrNull(detail.discNumber), missing: 'Not tagged' },
				{ label: 'Year', value: numberOrNull(detail.year), missing: 'Not tagged' },
				{ label: 'Genre', value: detail.genre, missing: 'Not tagged' },
			],
		},
		{
			title: 'File',
			entries: [
				{ label: 'Name', value: detail.fileName, mono: true },
				{ label: 'Path', value: detail.path, mono: true },
				{ label: 'Size', value: formatFileSize(detail.fileSize) },
				{ label: 'Modified', value: dateFormat.format(detail.modifiedAtMs) },
			],
		},
	];
	return all.map((section) => ({
		...section,
		entries: section.entries.filter((entry) => entry.value !== null || entry.missing),
	}));
});
</script>

<template>
	<UAlert
		v-if="error"
		color="error"
		variant="subtle"
		:icon="useAppConfig().ui.icons.error"
		title="The details of this track could not be loaded"
		:description="
			error.statusCode === 404 ? 'It is no longer in the library.' : 'Try again in a moment.'
		"
	/>
	<div v-else-if="track" class="flex flex-col gap-6">
		<UAlert
			v-if="track.lossless === null"
			color="neutral"
			variant="subtle"
			:icon="useAppConfig().ui.icons.info"
			description="The audio details of this track are read at the next scan."
		/>
		<section
			v-for="section in sections"
			:key="section.title"
			class="flex flex-col gap-2"
			:aria-labelledby="`track-${id}-${section.title.toLowerCase()}`"
		>
			<h3
				:id="`track-${id}-${section.title.toLowerCase()}`"
				class="text-sm font-semibold text-highlighted"
			>
				{{ section.title }}
			</h3>
			<dl class="grid grid-cols-[minmax(0,8rem)_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-sm">
				<template v-for="entry in section.entries" :key="entry.label">
					<dt class="text-muted">{{ entry.label }}</dt>
					<dd v-if="entry.value === null" class="text-dimmed">{{ entry.missing }}</dd>
					<dd v-else :class="entry.mono ? 'font-mono break-all' : 'text-highlighted'">
						{{ entry.value }}
					</dd>
				</template>
			</dl>
		</section>
	</div>
	<div v-else class="flex justify-center py-6" role="status" aria-label="Loading the details">
		<UIcon :name="useAppConfig().ui.icons.loading" class="size-5 animate-spin text-muted" />
	</div>
</template>
