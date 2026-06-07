<script lang="ts">
	import { Box, Layers, Search } from '@lucide/svelte';
	import { editorState } from '$lib/stores/editor.svelte';
</script>

<div class="flex h-full flex-col bg-background">
	<div class="flex h-10 items-center justify-between border-b px-3">
		<span class="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Objects</span
		>
		<button class="text-muted-foreground hover:text-foreground">
			<Search class="h-3.5 w-3.5" />
		</button>
	</div>
	<div class="flex-1 overflow-y-auto p-2">
		<div class="space-y-1">
			{#each editorState.parts as part}
				<button
					onclick={(e) => {
						if (e.shiftKey) {
							editorState.toggleSelect(part.id);
						} else {
							editorState.select(part.id);
						}
					}}
					class="group flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent {editorState.isSelected(part.id)
						? 'bg-accent text-accent-foreground'
						: ''}"
				>
					<Box class="h-4 w-4 text-muted-foreground group-hover:text-foreground" />
					<span>{part.name}</span>
				</button>
			{/each}
			{#if editorState.parts.length === 0}
				<p class="px-2 py-4 text-xs text-muted-foreground">No objects in scene</p>
			{/if}
		</div>
	</div>
</div>
