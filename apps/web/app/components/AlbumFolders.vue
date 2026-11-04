<script setup lang="ts">
import type { AlbumFolder } from '@luz/core';

defineProps<{ folders: AlbumFolder[] }>();

const appConfig = useAppConfig();
const { copyPath } = useCopyPath();
</script>

<template>
	<!-- Shown relative to the music library, which the page already names; the full path is
	     what gets copied, and what a hover shows -->
	<ul class="flex flex-col gap-0.5" :aria-label="folders.length === 1 ? 'Folder' : 'Folders'">
		<li v-for="folder in folders" :key="folder.path" class="flex items-center gap-1.5">
			<UIcon :name="appConfig.ui.icons.folder" class="size-4 shrink-0 text-muted" />
			<span class="min-w-0 font-mono text-sm break-all text-muted" :title="folder.path">
				{{ folder.relativePath ?? folder.path }}
			</span>
			<UTooltip text="Copy path">
				<UButton
					:icon="appConfig.ui.icons.copy"
					:aria-label="`Copy path ${folder.path}`"
					size="xs"
					color="neutral"
					variant="ghost"
					square
					class="shrink-0"
					@click="copyPath(folder.path)"
				/>
			</UTooltip>
		</li>
	</ul>
</template>
