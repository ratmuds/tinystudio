<script lang="ts">
	import { Monitor, Box } from '@lucide/svelte';
	let { children } = $props();
	let activeTab = $state('scene');

	import WorldStudio from '$lib/components/editor/WorldStudio.svelte';
	import ModelStudio from '$lib/components/editor/ModelStudio.svelte';
</script>

<div class="flex h-full flex-col bg-muted/20">
	<div class="flex h-10 items-end border-b bg-muted/40 px-2">
		<!-- World Studio -->
		<button
			onclick={() => (activeTab = 'scene')}
			class="flex h-8 items-center gap-2 rounded-t-sm border-x border-t px-4 text-xs font-medium transition-colors {activeTab ===
			'scene'
				? '-mb-[1px] border-b-background bg-background'
				: 'border-transparent bg-transparent text-muted-foreground hover:bg-muted/50'}"
		>
			<Monitor class="h-3.5 w-3.5" />
			Scene
		</button>

		<!-- Model Studio -->
		<button
			onclick={() => (activeTab = 'model')}
			class="flex h-8 items-center gap-2 rounded-t-sm border-x border-t px-4 text-xs font-medium transition-colors {activeTab ===
			'model'
				? '-mb-[1px] border-b-background bg-background'
				: 'border-transparent bg-transparent text-muted-foreground hover:bg-muted/50'}"
		>
			<Box class="h-3.5 w-3.5" />
			Model
		</button>
	</div>
	<div class="relative flex-1 overflow-auto p-4">
		<div class={activeTab === 'scene' ? 'block' : 'hidden'}>
			<WorldStudio />
		</div>

		<div class={activeTab === 'model' ? 'block' : 'hidden'}>
			<ModelStudio />
		</div>
	</div>
</div>
