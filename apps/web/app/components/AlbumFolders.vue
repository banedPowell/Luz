<script setup lang="ts">
const props = defineProps<{ folders: string[] }>();

const appConfig = useAppConfig();
const toast = useToast();

// The folder last copied, so its button confirms the copy for a moment
const copied = ref<string | null>(null);
let resetTimer: ReturnType<typeof setTimeout> | undefined;

async function copy(folder: string) {
	try {
		await navigator.clipboard.writeText(folder);
	} catch {
		// The clipboard needs a secure context and the page's permission
		toast.add({
			title: 'Could not copy the path',
			description: 'Select it and copy it by hand.',
			color: 'error',
			icon: appConfig.ui.icons.error,
		});
		return;
	}
	copied.value = folder;
	clearTimeout(resetTimer);
	resetTimer = setTimeout(() => (copied.value = null), 2000);
}

onBeforeUnmount(() => clearTimeout(resetTimer));

const label = computed(() => (props.folders.length === 1 ? 'Folder' : 'Folders'));
</script>

<template>
	<div class="flex flex-col gap-1">
		<h3 class="text-xs font-medium text-muted">{{ label }}</h3>
		<ul class="flex flex-col gap-1">
			<li v-for="folder in folders" :key="folder" class="flex items-center gap-2">
				<UIcon :name="appConfig.ui.icons.folder" class="size-4 shrink-0 text-muted" />
				<code class="min-w-0 font-mono text-sm break-all text-default">{{ folder }}</code>
				<UButton
					:icon="
						copied === folder ? appConfig.ui.icons.copyCheck : appConfig.ui.icons.copy
					"
					:aria-label="`Copy path ${folder}`"
					size="xs"
					color="neutral"
					variant="ghost"
					class="shrink-0"
					@click="copy(folder)"
				>
					<!-- Icon only on narrow screens, where the path needs the width -->
					<span class="hidden sm:inline">{{
						copied === folder ? 'Copied' : 'Copy path'
					}}</span>
				</UButton>
			</li>
		</ul>
	</div>
</template>
