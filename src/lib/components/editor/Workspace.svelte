<script lang="ts">
	import { Monitor, Box } from '@lucide/svelte';
	import { editor } from '$lib/stores/editor.svelte';
	let { children } = $props();
	import WorldStudio from '$lib/components/editor/WorldStudio.svelte';
	import ModelStudio from '$lib/components/editor/ModelStudio.svelte';
	import TextureStudio from '$lib/components/editor/TextureStudio.svelte';
	import ScriptStudio from '$lib/components/editor/ScriptStudio.svelte';
</script>

<div class="flex h-full flex-col bg-muted/20">
	<div class="flex h-10 items-end border-b bg-muted/40 px-2">
		{#each editor.tabs as tab}
			<button
				onclick={() => editor.switchTab(tab.type)}
				class="flex h-8 items-center gap-2 rounded-t-sm border-x border-t px-4 text-xs font-medium transition-colors {editor.activeTab ===
				tab
					? '-mb-[1px] border-b-background bg-background'
					: 'border-transparent bg-transparent text-muted-foreground hover:bg-muted/50'}"
			>
				{#if tab.type === 'scene'}
					<Monitor class="h-3.5 w-3.5" />
				{:else if tab.type === 'model'}
					<Box class="h-3.5 w-3.5" />
				{:else if tab.type === 'texture'}
					<Box class="h-3.5 w-3.5" />
				{:else if tab.type === 'script'}
					<Box class="h-3.5 w-3.5" />
				{/if}
				{tab.name}
			</button>
		{/each}
	</div>
	<div class="relative flex-1 overflow-auto p-4">
		<div class={editor.activeTab?.type === 'scene' ? 'block' : 'hidden'}>
			<WorldStudio />
		</div>

		<div class={editor.activeTab?.type === 'model' ? 'block' : 'hidden'}>
			<ModelStudio />
		</div>

		<div class={editor.activeTab?.type === 'texture' ? 'block' : 'hidden'}>
			<TextureStudio />
		</div>

		<div class={editor.activeTab?.type === 'script' ? 'block' : 'hidden'}>
			<ScriptStudio />
		</div>
	</div>
</div>
