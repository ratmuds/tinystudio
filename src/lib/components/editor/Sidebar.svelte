<script lang="ts">
	import { Box, Link2, Search } from '@lucide/svelte';
	import { editor } from '$lib/stores/editor.svelte';

	let editorState = $derived(editor.activeTab);

	function getChildren(parentId: string): string[] {
		if (!editorState || !editorState.parts) return [];

		return (editorState.parts ?? []).filter((p) => p.parentId === parentId).map((p) => p.id);
	}
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
			{#if editorState}
				{#each (editorState.parts ?? []).filter((p) => !p.parentId) as part}
					{@const children = getChildren(part.id)}
					<button
						onclick={(e) => {
							if (e.shiftKey) {
								editorState.toggleSelect(part.id);
							} else {
								editorState.select(part.id);
							}
						}}
						class="group flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent {editorState.isSelected(
							part.id
						)
							? 'bg-accent text-accent-foreground'
							: ''}"
					>
						<Box class="h-4 w-4 text-muted-foreground group-hover:text-foreground" />
						<span>{part.name}</span>
					</button>
					{#each children as childId}
						{@const child = (editorState.parts ?? []).find((p) => p.id === childId)}
						{#if child}
							<button
								onclick={(e) => {
									if (e.shiftKey) {
										editorState.toggleSelect(child.id);
									} else {
										editorState.select(child.id);
									}
								}}
								class="group flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 pl-6 text-sm hover:bg-accent {editorState.isSelected(
									child.id
								)
									? 'bg-accent text-accent-foreground'
									: ''}"
							>
								<Box class="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground" />
								<span>{child.name}</span>
							</button>
						{/if}
					{/each}
				{/each}
			{/if}
		</div>

		{#if editorState && (editorState.constraints ?? []).length > 0}
			<div
				class="mt-2 mb-1 border-t px-2 pt-2 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase"
			>
				Constraints
			</div>
			<div class="space-y-1">
				{#each editorState.constraints ?? [] as constraint}
					<button
						onclick={() => editorState.select(constraint.id)}
						class="group flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent {editorState.isSelected(
							constraint.id
						)
							? 'bg-accent text-accent-foreground'
							: ''}"
					>
						<Link2 class="h-4 w-4 text-muted-foreground group-hover:text-foreground" />
						<span class="text-xs">{constraint.name}</span>
					</button>
				{/each}
			</div>
		{/if}

		{#if !editorState || (editorState.parts ?? []).length === 0}
			<p class="px-2 py-4 text-xs text-muted-foreground">No objects in scene</p>
		{/if}
	</div>
</div>
