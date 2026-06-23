<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { ModeWatcher } from "mode-watcher";

	let { children } = $props();
</script>

<ModeWatcher />

<svelte:head><link rel="icon" href={favicon} /></svelte:head>
<div class="w-full h-full">
	{@render children()}
</div>
