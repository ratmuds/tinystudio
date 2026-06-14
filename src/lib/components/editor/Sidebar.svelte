<script lang="ts">
	import * as THREE from 'three';
	import { Box, Camera, ChevronDown, ChevronRight, FileCode, Link2, Plus } from '@lucide/svelte';
	import * as Command from '$lib/components/ui/command/index.js';
	import * as Popover from '$lib/components/ui/popover/index.js';
	import { buttonVariants } from '$lib/components/ui/button/index.js';
	import { editor } from '$lib/stores/editor.svelte';
	import type { PartNode, ScriptNode, CameraNode, TreeNode } from '$lib/stores/editor.svelte';
	import { fade } from 'svelte/transition';

	let editorState = $derived(editor.activeTab);
	let popoverOpen = $state(false);
	let commandValue = $state('');

	function closeAndReset() {
		popoverOpen = false;
		commandValue = '';
	}

	function addPart() {
		if (!editorState) return;
		const node = makeNewPart();
		editorState.addPart(node);
		editorState.select(node.id);
		closeAndReset();
	}

	function addCamera() {
		if (!editorState) return;
		const node = makeNewCamera();
		editorState.addCamera(node);
		editorState.select(node.id);
		closeAndReset();
	}

	function addScript() {
		if (!editorState) return;
		const node = makeNewScript();
		editorState.addScript(node);
		editorState.select(node.id);
		closeAndReset();
	}

	// Track which node ids are collapsed in the tree
	let collapsed = $state<Set<string>>(new Set());

	function toggleCollapsed(id: string) {
		const next = new Set(collapsed);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		collapsed = next;
	}

	function isCollapsed(id: string): boolean {
		return collapsed.has(id);
	}

	// Root-level tree nodes (no parent)
	let rootNodes = $derived(
		editorState ? (editorState.allTreeNodes ?? []).filter((n) => !n.parentId) : []
	);

	// ---------- Drag and drop ----------
	let dragOverId = $state<string | null>(null);
	let dragOverRoot = $state(false);

	function handleDragStart(e: DragEvent, id: string) {
		if (!e.dataTransfer) return;
		e.stopPropagation();

		console.log('moving', editorState.getNode(id));

		e.dataTransfer.effectAllowed = 'move';
		e.dataTransfer.setData('application/x-tinystudio-node', id);
	}

	function handleDragOver(e: DragEvent, id: string) {
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
		dragOverId = id;
	}

	function handleDragOverRoot(e: DragEvent) {
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
		dragOverRoot = true;
	}

	function clearDragOver() {
		dragOverId = null;
		dragOverRoot = false;
	}

	function handleDrop(e: DragEvent, targetId: string) {
		e.preventDefault();
		e.stopPropagation();
		const id = e.dataTransfer?.getData('application/x-tinystudio-node');
		clearDragOver();
		if (!id || !editorState) return;
		if (id === targetId) return;
		// Don't allow dropping a constraint (none should be in the tree anyway)
		const node = editorState.getNode(id);
		if (!node || node.type === 'constraint') return;
		editorState.reparent(id, targetId);
	}

	function handleDropRoot(e: DragEvent) {
		e.preventDefault();
		const id = e.dataTransfer?.getData('application/x-tinystudio-node');
		clearDragOver();
		if (!id || !editorState) return;
		const node = editorState.getNode(id);
		if (!node || node.type === 'constraint') return;
		editorState.reparent(id, undefined);
	}

	// ---------- Selection ----------
	function selectNode(e: MouseEvent, id: string) {
		if (e.shiftKey) editorState.toggleSelect(id);
		else editorState.select(id);
	}

	function makeNewPart(parentId?: string): PartNode {
		const obj = new THREE.Object3D();
		return {
			id: crypto.randomUUID(),
			name: 'Part',
			type: 'part',
			object3D: obj
		};
	}

	function makeNewCamera(parentId?: string): CameraNode {
		const perspective = new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 1000);
		return {
			id: crypto.randomUUID(),
			name: 'Camera',
			type: 'camera',
			perspective,
			fov: 75,
			near: 0.1,
			far: 1000
		};
	}

	function makeNewScript(parentId?: string): ScriptNode {
		return {
			id: crypto.randomUUID(),
			name: 'Script',
			type: 'script',
			code: '-- new script\n',
			parentId
		};
	}
</script>

<div class="flex h-full flex-col bg-background">
	<div class="flex h-10 items-center justify-between border-b px-3">
		<span class="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
			Objects
		</span>

		<Popover.Root bind:open={popoverOpen}>
			<Popover.Trigger
				class="px-1 text-muted-foreground hover:text-foreground {buttonVariants({
					variant: 'ghost'
				})}"
				title="Add object"
			>
				<Plus class="h-3.5 w-3.5" />
			</Popover.Trigger>
			<Popover.Content class="w-80 bg-transparent p-0">
				<Command.Root class="rounded p-3" bind:value={commandValue}>
					<Command.Input placeholder="Add an object..." />
					<Command.List>
						<Command.Empty>No results found.</Command.Empty>
						<Command.Group heading="Add">
							<Command.Item value="part" onSelect={addPart}>
								<Box class="h-4 w-4" />
								<span>Part</span>
								<Command.Shortcut>P</Command.Shortcut>
							</Command.Item>
							<Command.Item value="camera" onSelect={addCamera}>
								<Camera class="h-4 w-4" />
								<span>Camera</span>
								<Command.Shortcut>C</Command.Shortcut>
							</Command.Item>
							<Command.Item value="script" onSelect={addScript}>
								<FileCode class="h-4 w-4" />
								<span>Script</span>
								<Command.Shortcut>S</Command.Shortcut>
							</Command.Item>
						</Command.Group>
					</Command.List>
				</Command.Root>
			</Popover.Content>
		</Popover.Root>
	</div>

	<div
		class="flex-1 overflow-y-auto p-2"
		role="tree"
		tabindex="-1"
		ondragover={handleDragOverRoot}
		ondrop={handleDropRoot}
		ondragleave={() => (dragOverRoot = false)}
		class:!bg-accent={dragOverRoot}
	>
		{#if editorState}
			{#if rootNodes.length > 0}
				<div class="space-y-0.5">
					{#each rootNodes as node (node.id)}
						{@render treeNode(node, 0)}
					{/each}
				</div>
			{/if}

			{#if (editorState.constraints ?? []).length > 0}
				<div
					class="mt-2 mb-1 border-t px-2 pt-2 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase"
				>
					Constraints
				</div>
				<div class="space-y-0.5">
					{#each editorState.constraints ?? [] as constraint (constraint.id)}
						<button
							onclick={() => editorState!.select(constraint.id)}
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

			{#if rootNodes.length === 0 && (editorState.constraints ?? []).length === 0}
				<p class="px-2 py-4 text-xs text-muted-foreground">No objects in scene</p>
			{/if}
		{/if}
	</div>
</div>

{#snippet treeNode(node: TreeNode, depth: number)}
	{@const children = editorState?.getChildren(node.id) ?? []}
	{@const hasChildren = children.length > 0}
	{@const collapsedNow = isCollapsed(node.id)}
	{@const Icon = node.type === 'camera' ? Camera : node.type === 'script' ? FileCode : Box}
	<div
		role="treeitem"
		tabindex="-1"
		aria-expanded={hasChildren ? !collapsedNow : undefined}
		aria-selected={editorState?.isSelected(node.id) ?? false}
		draggable="true"
		ondragstart={(e) => handleDragStart(e, node.id)}
		ondragover={(e) => handleDragOver(e, node.id)}
		ondragleave={() => (dragOverId = null)}
		ondrop={(e) => handleDrop(e, node.id)}
		class="mb-1 rounded {dragOverId === node.id ? 'bg-accent/60 ring-1 ring-primary' : ''}"
	>
		<div
			class="group flex w-full cursor-pointer items-center gap-1 rounded px-1 py-1.5 text-sm hover:bg-accent {editorState?.isSelected(
				node.id
			)
				? 'bg-accent text-accent-foreground'
				: ''}"
			style="padding-left: {depth * 12 + 4}px"
			onclick={(e) => selectNode(e, node.id)}
			role="button"
			tabindex="0"
			onkeydown={(e) => {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					selectNode(e as unknown as MouseEvent, node.id);
				}
			}}
		>
			<button
				type="button"
				class="flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground"
				onclick={(e) => {
					e.stopPropagation();
					if (hasChildren) toggleCollapsed(node.id);
				}}
				tabindex={hasChildren ? 0 : -1}
				aria-label={hasChildren ? (collapsedNow ? 'Expand' : 'Collapse') : ''}
			>
				{#if hasChildren}
					{#if collapsedNow}
						<ChevronRight class="h-3 w-3" />
					{:else}
						<ChevronDown class="h-3 w-3" />
					{/if}
				{/if}
			</button>
			<Icon class="h-3.5 w-3.5 shrink-0 text-muted-foreground group-hover:text-foreground" />
			<span class="truncate">{node.name}</span>
		</div>
		{#if hasChildren && !collapsedNow}
			<div role="group">
				{#each children as child (child.id)}
					{@render treeNode(child, depth + 1)}
				{/each}
			</div>
		{/if}
	</div>
{/snippet}
