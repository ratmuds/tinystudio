<script lang="ts">
	import { onMount } from 'svelte';
	import * as THREE from 'three';
	import Renderer, { type RendererContext } from '$lib/components/editor/Renderer.svelte';
	import { gameAssets, editorState, type Model, type PartNode } from '$lib/stores/editor.svelte';

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
		const group = new THREE.Group();
		group.name = model.name;
		group.userData.isSpawnedModel = true;
		group.userData.modelId = model.id;

		for (const part of model.parts) {
			const clone = part.object3D.clone(true);
			clone.userData = { ...part.object3D.userData };
			group.add(clone);
		}

		group.position.set(spawnOffset, 0, 0);
		spawnOffset += 2;

		const id = partId();
		group.userData.partId = id;

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
		scene.add(stud);

		const trunkMat = new THREE.MeshStandardMaterial({ color: COLORS.trunk });
		const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 2, 6), trunkMat);
		trunk.position.set(2, 0.5, 2);
		trunk.castShadow = true;
		trunk.receiveShadow = true;
		scene.add(trunk);

		const leafMat = new THREE.MeshStandardMaterial({ color: COLORS.leaves });
		const offsets = [
			[0, 2.5, 0],
			[-0.8, 2, 0.6],
			[0.7, 2.1, -0.5],
			[-0.3, 1.8, -0.8]
		];
		for (const [dx, dy, dz] of offsets) {
			const s = 0.6 + Math.random() * 0.3;
			const leaf = new THREE.Mesh(new THREE.SphereGeometry(s, 6, 5), leafMat);
			leaf.position.set(2 + dx, dy, 2 + dz);
			leaf.castShadow = true;
			leaf.receiveShadow = true;
			scene.add(leaf);
		}

		const sunMat = new THREE.MeshStandardMaterial({ color: COLORS.sun });
		const sun = new THREE.Mesh(new THREE.CircleGeometry(1.2, 8), sunMat);
		sun.position.set(-8, 6, -10);
		scene.add(sun);

		// Lights
		const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
		ambientLight.castShadow = true;
		scene.add(ambientLight);
		const directionalLight = new THREE.DirectionalLight(0xffffff, 2.5);
		directionalLight.position.set(-5, 10, -5);
		directionalLight.castShadow = true;
		scene.add(directionalLight);

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
			<div class="w-fit {currentTool === 'select' ? 'bg-blue-500' : ''}">Select</div>
			<div class="w-fit {currentTool === 'move' ? 'bg-blue-500' : ''}">Move</div>
			<div class="w-fit {currentTool === 'rotate' ? 'bg-blue-500' : ''}">Rotate</div>
			<div class="w-fit {currentTool === 'scale' ? 'bg-blue-500' : ''}">Scale</div>
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
