<script lang="ts">
	import { Play, Save, Settings, Share2 } from '@lucide/svelte';
	import { editor } from '$lib/stores/editor.svelte';
</script>

<header class="flex h-12 w-full items-center justify-between border-b bg-muted/40 px-4">
	<div class="flex items-center gap-2">
		<span class="text-lg font-bold tracking-tighter text-primary">tinystudio</span>
	</div>

	<div class="flex items-center gap-2">
		<span class="text-sm font-medium text-muted-foreground">Untitled Project</span>
	</div>

	<div class="flex items-center gap-2">
		<button
			class="inline-flex h-8 items-center justify-center rounded-md px-3 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
			onclick={editor.togglePlayTest}
		>
			<Play class="mr-2 h-4 w-4" />
			Run
		</button>
		<button
			class="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent hover:text-accent-foreground"
		>
			<Save class="h-4 w-4" />
		</button>
		<button
			class="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent hover:text-accent-foreground"
		>
			<Share2 class="h-4 w-4" />
		</button>
		<div class="mx-1 h-4 w-px bg-border"></div>
		<button
			class="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent hover:text-accent-foreground"
		>
			<Settings class="h-4 w-4" />
		</button>
	</div>
</header>
