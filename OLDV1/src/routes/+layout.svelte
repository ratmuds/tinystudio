<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { ModeWatcher } from 'mode-watcher';
	import { onMount } from 'svelte';
	import Topbar from '$lib/components/editor/Topbar.svelte';
	import Sidebar from '$lib/components/editor/Sidebar.svelte';
	import Workspace from '$lib/components/editor/Workspace.svelte';
	import Properties from '$lib/components/editor/Properties.svelte';
	import { PaneGroup, Pane, PaneResizer } from 'paneforge';
	import { editor } from '$lib/stores/editor.svelte';

	let { children } = $props();

	onMount(() => {
		editor.loadProject(editor.projectName);
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<ModeWatcher defaultMode="dark" />

<div
	class="flex h-screen flex-col overflow-hidden bg-background text-foreground transition-colors duration-300"
>
	<Topbar />

	<main class="flex-1 overflow-hidden">
		<PaneGroup direction="horizontal">
			<Pane defaultSize={20} minSize={15}>
				<Sidebar />
			</Pane>
			<PaneResizer class="w-1 bg-border transition-colors hover:bg-primary/50" />
			<Pane defaultSize={60}>
				<Workspace>
					{@render children()}
				</Workspace>
			</Pane>
			<PaneResizer class="w-1 bg-border transition-colors hover:bg-primary/50" />
			<Pane defaultSize={20} minSize={15}>
				<Properties />
			</Pane>
		</PaneGroup>
	</main>
</div>
