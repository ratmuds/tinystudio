<script lang="ts">
	import { onMount } from 'svelte';
	import * as THREE from 'three';
	import Renderer, { type RendererContext } from '$lib/components/editor/Renderer.svelte';
	import {
		gameAssets,
		editorState,
		type Model,
		type PartNode,
		EditorState,
		editor
	} from '$lib/stores/editor.svelte';

	const RES_W = 320;
	const RES_H = 240;
	const COLORS = {
		sky: 0x87ceeb,
		grass: 0x7cc46b,
		stud: 0xe8b84b,
		studTop: 0xf5d06f,
		trunk: 0x8b5e3c,
		leaves: 0x5da13d,
		sun: 0xffee88
	};

	const sceneTab = new EditorState();
	sceneTab.name = 'Scene';
	sceneTab.type = 'scene';

	editor.addTab(sceneTab);
	editor.switchTab('scene');

	const scene = new THREE.Scene();
	const camera = new THREE.PerspectiveCamera(60, RES_W / RES_H, 0.1, 1000);
	camera.position.set(6, 5, 8);
	camera.lookAt(0, 0, 0);

	let currentTool = $state<'select' | 'move' | 'rotate' | 'scale'>('select');
	let selectionMode = $state<'part' | 'face'>('part');
	let renderer: THREE.WebGLRenderer;

	const spawnedObjects: THREE.Object3D[] = [];
	let spawnOffset = 0;

	function getVisibleParts() {
		return editorState.parts;
	}

	function partId(): string {
		return crypto.randomUUID();
	}

	function spawnModel(model: Model) {
		const id = partId();
		const group = new THREE.Group();
		group.name = model.name;
		group.userData.isSpawnedModel = true;
		group.userData.modelId = model.id;
		group.userData.partId = id;

		for (const part of model.parts) {
			const clone = part.object3D.clone(true);
			clone.userData = { ...part.object3D.userData };
			// Ensure children also have partId for raycasting hit detection if needed
			clone.traverse((child) => {
				child.userData.partId = id;
				if (child instanceof THREE.Mesh) {
					child.castShadow = true;
					child.receiveShadow = true;
				}
			});
			group.add(clone);
		}

		group.position.set(spawnOffset, 0, 0);
		spawnOffset += 2;

		editorState.addPart({
			id,
			name: model.name,
			type: 'part',
			object3D: group
		});

		scene.add(group);
		spawnedObjects.push(group);
		editorState.select(id);
	}

	function handleRendererReady(ctx: RendererContext) {
		renderer = ctx.renderer;
	}

	onMount(() => {
		const groundGeo = new THREE.PlaneGeometry(16, 16);
		const groundMat = new THREE.MeshStandardMaterial({ color: COLORS.grass });
		const ground = new THREE.Mesh(groundGeo, groundMat);
		ground.rotation.x = -Math.PI / 2;
		ground.position.y = -0.5;
		ground.castShadow = true;
		ground.receiveShadow = true;
		scene.add(ground);

		const stud = new THREE.Group();
		const studMat = new THREE.MeshStandardMaterial({ color: COLORS.stud });
		const studTopMat = new THREE.MeshStandardMaterial({ color: COLORS.studTop });
		const studBody = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.4, 0.9), studMat);
		studBody.position.y = -0.3;
		studBody.castShadow = true;
		studBody.receiveShadow = true;
		stud.add(studBody);
		const studTop = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.08, 8), studTopMat);
		studTop.position.y = -0.06;
		studTop.castShadow = true;
		studTop.receiveShadow = true;
		stud.add(studTop);
		const studId = partId();
		stud.userData.partId = studId;
		stud.traverse((c) => (c.userData.partId = studId));
		editorState.addPart({ id: studId, name: 'Stud', type: 'part', object3D: stud });
		scene.add(stud);

		const trunkMat = new THREE.MeshStandardMaterial({ color: COLORS.trunk });
		const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 2, 6), trunkMat);
		trunk.position.set(2, 0.5, 2);
		trunk.castShadow = true;
		trunk.receiveShadow = true;
		const trunkId = partId();
		trunk.userData.partId = trunkId;
		editorState.addPart({ id: trunkId, name: 'Trunk', type: 'part', object3D: trunk });
		scene.add(trunk);

		const leafMat = new THREE.MeshStandardMaterial({ color: COLORS.leaves });
		const offsets = [
			[0, 2.5, 0],
			[-0.8, 2, 0.6],
			[0.7, 2.1, -0.5],
			[-0.3, 1.8, -0.8]
		];
		for (let i = 0; i < offsets.length; i++) {
			const [dx, dy, dz] = offsets[i];
			const s = 0.6 + Math.random() * 0.3;
			const leaf = new THREE.Mesh(new THREE.SphereGeometry(s, 6, 5), leafMat);
			leaf.position.set(2 + dx, dy, 2 + dz);
			leaf.castShadow = true;
			leaf.receiveShadow = true;
			const leafId = partId();
			leaf.userData.partId = leafId;
			editorState.addPart({ id: leafId, name: `Leaf ${i + 1}`, type: 'part', object3D: leaf });
			scene.add(leaf);
		}

		const sunMat = new THREE.MeshStandardMaterial({ color: COLORS.sun });
		const sun = new THREE.Mesh(new THREE.CircleGeometry(1.2, 8), sunMat);
		sun.position.set(-8, 6, -10);
		const sunId = partId();
		sun.userData.partId = sunId;
		editorState.addPart({ id: sunId, name: 'Sun', type: 'part', object3D: sun });
		scene.add(sun);

		return () => {
			for (const obj of spawnedObjects) {
				const partId = obj.userData.partId;
				if (partId) {
					editorState.removePart(partId);
				}
				scene.remove(obj);
			}
		};
	});
</script>

<Renderer
	{scene}
	{camera}
	{editorState}
	addLights={true}
	backgroundColor={COLORS.sky}
	orbitTarget={new THREE.Vector3(0, 1, 0)}
	orbitMinDistance={3}
	orbitMaxDistance={20}
	orbitMaxPolarAngle={Math.PI / 2.2}
	bind:selectionMode
	bind:currentTool
	{getVisibleParts}
	onReady={handleRendererReady}
/>

<div class="flex flex-col gap-5 p-3">
	<div>
		<div class="border">
			<button
				class="w-fit {currentTool === 'select' ? 'bg-blue-500' : ''}"
				onclick={() => (currentTool = 'select')}>Select</button
			>
			<button
				class="w-fit {currentTool === 'move' ? 'bg-blue-500' : ''}"
				onclick={() => (currentTool = 'move')}>Move</button
			>
			<button
				class="w-fit {currentTool === 'rotate' ? 'bg-blue-500' : ''}"
				onclick={() => (currentTool = 'rotate')}>Rotate</button
			>
			<button
				class="w-fit {currentTool === 'scale' ? 'bg-blue-500' : ''}"
				onclick={() => (currentTool = 'scale')}>Scale</button
			>
		</div>
	</div>

	<div>
		<div class="mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
			Assets ({gameAssets.models.length})
		</div>
		<div class="space-y-1">
			{#each gameAssets.models as model (model.id)}
				<div class="flex items-center justify-between gap-2 rounded border px-2 py-1 text-sm">
					<span class="truncate">{model.name}</span>
					<button onclick={() => spawnModel(model)} class="border p-2">Spawn</button>
				</div>
			{/each}
			{#if gameAssets.models.length === 0}
				<p class="px-1 py-2 text-xs text-muted-foreground">No saved models</p>
			{/if}
		</div>
	</div>
</div>
