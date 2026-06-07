<script lang="ts">
	import { Info } from '@lucide/svelte';
	import { editorState } from '$lib/stores/editor.svelte';

	let posX = $state('0.00');
	let posY = $state('0.00');
	let posZ = $state('0.00');
	let rotX = $state('0.00');
	let rotY = $state('0.00');
	let rotZ = $state('0.00');
	let sclX = $state('0.00');
	let sclY = $state('0.00');
	let sclZ = $state('0.00');

	$effect(() => {
		const part = editorState.firstSelectedPart;
		if (!part) {
			posX = posY = posZ = '0.00';
			rotX = rotY = rotZ = '0.00';
			sclX = sclY = sclZ = '0.00';
			return;
		}

		const obj = part.object3D;
		const id = setInterval(() => {
			posX = obj.position.x.toFixed(2);
			posY = obj.position.y.toFixed(2);
			posZ = obj.position.z.toFixed(2);
			rotX = (obj.rotation.x * (180 / Math.PI)).toFixed(2);
			rotY = (obj.rotation.y * (180 / Math.PI)).toFixed(2);
			rotZ = (obj.rotation.z * (180 / Math.PI)).toFixed(2);
			sclX = obj.scale.x.toFixed(2);
			sclY = obj.scale.y.toFixed(2);
			sclZ = obj.scale.z.toFixed(2);
		}, 30);

		return () => clearInterval(id);
	});

	function updatePosition(axis: 'x' | 'y' | 'z', value: string) {
		const num = parseFloat(value);
		if (isNaN(num)) return;
		for (const part of editorState.selectedParts) {
			part.object3D.position[axis] = num;
		}
	}
</script>

<div class="flex h-full flex-col bg-background">
	<div class="flex h-10 items-center justify-between border-b px-3">
		<span class="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Properties</span>
		<button class="text-muted-foreground hover:text-foreground">
			<Info class="h-3.5 w-3.5" />
		</button>
	</div>
	<div class="flex-1 overflow-y-auto p-4">
		{#if editorState.firstSelectedPart}
			<div class="space-y-4">
				<div>
					<span class="text-xs font-medium text-muted-foreground uppercase">Selection</span>
					<p class="mt-1 text-sm">
						{editorState.selectedIds.length} object{editorState.selectedIds.length !== 1 ? 's' : ''}
					</p>
				</div>
				<div>
					<span class="text-xs font-medium text-muted-foreground uppercase">Transform</span>
					<div class="mt-2 space-y-2">
						{#each [{ label: 'Position', x: posX, y: posY, z: posZ, update: updatePosition }, { label: 'Rotation', x: rotX, y: rotY, z: rotZ, update: null as any }, { label: 'Scale', x: sclX, y: sclY, z: sclZ, update: null as any }] as group}
							<div class="flex items-center gap-2">
								<span class="w-16 text-xs text-muted-foreground">{group.label}</span>
								<div class="flex flex-1 gap-1">
									{#each [{ val: group.x, axis: 'x' as const, label: 'X' }, { val: group.y, axis: 'y' as const, label: 'Y' }, { val: group.z, axis: 'z' as const, label: 'Z' }] as field}
										<div class="relative flex-1">
											<input
												type="text"
												value={field.val}
												oninput={(e) => {
													const target = e.target as HTMLInputElement;
													if (group.update) group.update(field.axis, target.value);
												}}
												class="w-full rounded border bg-muted/30 px-1 py-0.5 text-[10px] focus:ring-1 focus:ring-primary focus:outline-none"
											/>
											<span
												class="absolute top-1/2 right-1 -translate-y-1/2 text-[8px] text-muted-foreground"
												>{field.label}</span
											>
										</div>
									{/each}
								</div>
							</div>
						{/each}
					</div>
				</div>
			</div>
		{:else if editorState.selectedConstraints.length > 0}
			{@const c = editorState.selectedConstraints[0]}
			<div class="space-y-4">
				<div>
					<span class="text-xs font-medium text-muted-foreground uppercase">Constraint</span>
					<p class="mt-1 text-sm capitalize">{c.constraintType}</p>
				</div>
				<div>
					<span class="text-xs font-medium text-muted-foreground uppercase">Part A</span>
					<p class="mt-1 text-sm">
						{editorState.parts.find((p) => p.id === c.partAId)?.name ?? c.partAId}
					</p>
				</div>
				<div>
					<span class="text-xs font-medium text-muted-foreground uppercase">Part B</span>
					<p class="mt-1 text-sm">
						{editorState.parts.find((p) => p.id === c.partBId)?.name ?? c.partBId}
					</p>
				</div>
				<div>
					<span class="text-xs font-medium text-muted-foreground uppercase">Attachment</span>
					<div class="mt-1 space-y-1 text-xs text-muted-foreground">
						<p>A: {c.faceA}{" "}
							({c.offsetA.x.toFixed(1)}, {c.offsetA.y.toFixed(1)}, {c.offsetA.z.toFixed(1)})
						</p>
						<p>B: {c.faceB}{" "}
							({c.offsetB.x.toFixed(1)}, {c.offsetB.y.toFixed(1)}, {c.offsetB.z.toFixed(1)})
						</p>
					</div>
				</div>
			</div>
		{:else}
			<p class="text-xs text-muted-foreground">No object selected</p>
		{/if}
	</div>
</div>
