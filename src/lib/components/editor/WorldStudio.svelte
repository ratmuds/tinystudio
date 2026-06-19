<script lang="ts">
	import { onMount } from 'svelte';
	import * as THREE from 'three';
	import Renderer, { type RendererContext } from '$lib/components/editor/Renderer.svelte';
	import {
		gameAssets,
		editorState,
		type Model,
		type PartNode,
		type ConstraintNode,
		EditorState,
		editor,
		playTest
	} from '$lib/stores/editor.svelte';
	import RAPIER from '@dimforge/rapier3d-compat';
	import { LuaFactory, LuaReturn, type LuaThread } from 'wasmoon';
	const factory = new LuaFactory();

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

	const sceneTab = editor.tabs.find((t) => t.type === 'scene')!;
	editor.switchTab('scene');

	const scene = new THREE.Scene();
	const camera = new THREE.PerspectiveCamera(60, RES_W / RES_H, 0.1, 1000);
	camera.position.set(6, 5, 8);
	camera.lookAt(0, 0, 0);

	let currentTool = $state<'select' | 'move' | 'rotate' | 'scale'>('select');
	let selectionMode = $state<'part' | 'face'>('part');
	let renderer: THREE.WebGLRenderer;
	let playTestRenderer: THREE.WebGLRenderer;

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
			clone.traverse((child: THREE.Object3D) => {
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
		stud.traverse((c: THREE.Object3D) => ((c.userData as any).partId = studId));
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

		// Initialize physics
		console.log('Initializing physics...');
		RAPIER.init().then(() => {
			console.log('Physics initialized');
		});

		return () => {
			console.log('Cleaning up spawned objects...');
			for (const obj of spawnedObjects) {
				const partId = obj.userData.partId;
				if (partId) {
					editorState.removePart(partId);
				}
				scene.remove(obj);
			}
		};
	});

	async function startPlayTest() {
		playTest.active = true;
		playTest.parts = [];
		console.log('Play test started');

		console.log('Creating play test scene...');
		playTest.scene = new THREE.Scene();
		playTest.scene.background = new THREE.Color(COLORS.sky);

		playTest.camera = new THREE.PerspectiveCamera(60, RES_W / RES_H, 0.1, 1000);
		playTest.camera.position.copy(camera.position);
		playTest.camera.lookAt(0, 0, 0);

		console.log('Initializing physics world for play test...');
		playTest.physicsWorld = new RAPIER.World(playTest.physicsGravity);

		async function initGameEngine() {
			const lua = await factory.createEngine();

			lua.global.set('printLog', (...args) => console.log(...args));

			lua.global.set('applyVelocity', (partName: string, x: number, y: number, z: number) => {
				console.log(`applyVelocity called for part "${partName}" with velocity (${x}, ${y}, ${z})`);
				const part = playTest.parts.find((p) => p.name === partName);
				if (part && part.physicsBody) {
					part.physicsBody.setLinvel({ x, y, z }, true);
				}
			});

			await lua.doString(editorState.scripts[0].code);

			const mainThread: LuaThread = lua.global.get('mainThread');

			function step() {
				const { result, resultCount } = mainThread.resume();

				if (result !== LuaReturn.Yield && result !== LuaReturn.Ok) {
					console.error('Game loop crashed with result code:', result);
					lua.global.close();
					return;
				}

				let waitSeconds = 0;
				if (resultCount > 0) {
					const [first] = mainThread.getStackValues(0);
					if (typeof first === 'number') {
						waitSeconds = first;
					}
					mainThread.pop(resultCount);
				}

				if (!playTest.active) {
					console.log('Play test stopped, closing Lua engine');

					lua.global.close();
					return;
				}

				if (waitSeconds > 0) {
					setTimeout(step, waitSeconds * 1000);
				} else {
					requestAnimationFrame(step);
				}
			}

			requestAnimationFrame(step);
		}

		initGameEngine();

		// Add static ground for physics
		const groundDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0);
		const groundBody = playTest.physicsWorld.createRigidBody(groundDesc);
		const groundColliderDesc = RAPIER.ColliderDesc.cuboid(8, 0.1, 8);
		playTest.physicsWorld.createCollider(groundColliderDesc, groundBody);

		console.log('Cloning objects for play test...');
		for (const part of editorState.parts) {
			const clone = part.object3D.clone(true);
			clone.userData = { ...part.object3D.userData };
			clone.traverse((child: THREE.Object3D) => {
				child.userData.partId = part.id;
				if (child instanceof THREE.Mesh) {
					child.castShadow = true;
					child.receiveShadow = true;
				}
			});
			playTest.scene.add(clone);

			console.log(editorState.scripts);

			// Create a dynamic body for the part
			const bodyDesc = RAPIER.RigidBodyDesc.dynamic();
			const worldPos = part.object3D.position;
			const worldRot = part.object3D.quaternion;
			bodyDesc.setTranslation(worldPos.x, worldPos.y, worldPos.z);
			bodyDesc.setRotation({ x: worldRot.x, y: worldRot.y, z: worldRot.z, w: worldRot.w });
			const body = playTest.physicsWorld!.createRigidBody(bodyDesc);

			clone.traverse((child: THREE.Object3D) => {
				if (child instanceof THREE.Mesh) {
					const vertices: number[] = [];
					const position = child.geometry.getAttribute('position');

					for (let i = 0; i < position.count; i++) {
						vertices.push(position.getX(i), position.getY(i), position.getZ(i));
					}

					if (vertices.length === 0) return;

					let colliderDesc = RAPIER.ColliderDesc.convexHull(new Float32Array(vertices));
					if (!colliderDesc) return;

					// If this mesh is at an offset within the group, apply that offset to the collider
					if (child !== clone) {
						colliderDesc.setTranslation(child.position.x, child.position.y, child.position.z);
						colliderDesc.setRotation({
							x: child.quaternion.x,
							y: child.quaternion.y,
							z: child.quaternion.z,
							w: child.quaternion.w
						});
					}

					playTest.physicsWorld!.createCollider(colliderDesc, body);
				}
			});

			// Create new PartNode for play test ref
			const playTestPart: PartNode = {
				id: part.id,
				name: part.name,
				type: 'part',
				object3D: clone,
				physicsBody: body
			};
			playTest.parts.push(playTestPart);
		}

		// apply constraints
		for (const constraint of editorState.constraints) {
			const partA = playTest.parts.find((p) => p.id === constraint.partAId);
			const partB = playTest.parts.find((p) => p.id === constraint.partBId);
			if (!partA || !partB || !partA.physicsBody || !partB.physicsBody) continue;

			const worldAnchorA = new THREE.Vector3().addVectors(
				editorState.parts.find((p) => p.id === constraint.partAId)?.object3D.position ||
					new THREE.Vector3(),
				constraint.offsetA
			);
			const worldAnchorB = new THREE.Vector3().addVectors(
				editorState.parts.find((p) => p.id === constraint.partBId)?.object3D.position ||
					new THREE.Vector3(),
				constraint.offsetB
			);

			const partRotFrameA = new THREE.Quaternion().setFromEuler(
				new THREE.Euler(
					(constraint.faceA === '0' ? Math.PI / 2 : 0) +
						(constraint.constraintType === 'hinge' ? Math.PI / 2 : 0),
					0,
					(constraint.faceA === '1' ? -Math.PI / 2 : 0) +
						(constraint.constraintType === 'hinge' ? Math.PI / 2 : 0)
				)
			);
			const partRotFrameB = new THREE.Quaternion().setFromEuler(
				new THREE.Euler(
					(constraint.faceB === '0' ? Math.PI / 2 : 0) +
						(constraint.constraintType === 'hinge' ? Math.PI / 2 : 0),
					0,
					(constraint.faceB === '1' ? -Math.PI / 2 : 0) +
						(constraint.constraintType === 'hinge' ? Math.PI / 2 : 0)
				)
			);

			const rapierConstraint = RAPIER.JointData.fixed(
				worldAnchorA,
				partRotFrameA,
				worldAnchorB,
				partRotFrameB
			);
			playTest.physicsWorld!.createImpulseJoint(
				rapierConstraint,
				partA.physicsBody,
				partB.physicsBody,
				true
			);
		}

		const ambientLight = new THREE.AmbientLight(0xffffff, 1.25);
		playTest.scene.add(ambientLight);
		const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
		directionalLight.position.set(5, 10, 7.5);
		directionalLight.castShadow = true;
		directionalLight.shadow.mapSize.width = 1024;
		directionalLight.shadow.mapSize.height = 1024;
		directionalLight.shadow.camera.left = -20;
		directionalLight.shadow.camera.right = 20;
		directionalLight.shadow.camera.top = 20;
		directionalLight.shadow.camera.bottom = -20;
		playTest.scene.add(directionalLight);

		function animate() {
			if (!playTest.active) return;

			requestAnimationFrame(animate);

			// Step physics world
			if (playTest.physicsWorld) {
				playTest.physicsWorld.step();
			}

			// Sync object positions with physics bodies
			for (const part of playTest.parts) {
				if (part.physicsBody) {
					const pos = part.physicsBody.translation();
					const rot = part.physicsBody.rotation();
					part.object3D.position.set(pos.x, pos.y, pos.z);
					part.object3D.quaternion.set(rot.x, rot.y, rot.z, rot.w);
				}
			}
		}

		animate();
	}

	function stopPlayTest() {
		playTest.active = false;
		if (playTest.scene) {
			playTest.scene.traverse((obj: THREE.Object3D) => {
				if (obj instanceof THREE.Mesh) {
					obj.geometry?.dispose();
					if (Array.isArray(obj.material)) {
						obj.material.forEach((m: THREE.Material) => m.dispose());
					} else if (obj.material) {
						obj.material.dispose();
					}
				}
			});
			playTest.scene = null as any;
		}
		if (playTest.physicsWorld) {
			playTest.physicsWorld.free();
			playTest.physicsWorld = null;
		}
		playTest.parts = [];
	}

	function addConstraint() {
		if (editorState.selectedIds.length !== 2) {
			alert('Select exactly 2 parts to create a constraint');
			return;
		}

		const [partAId, partBId] = editorState.selectedIds;
		const [faceA, faceB] = editorState.selectedFaces;

		console.log(faceA, faceB);

		const newConstraintNode: ConstraintNode = {
			id: crypto.randomUUID(),
			name: 'Constraint',
			type: 'constraint',
			partAId,
			partBId,
			faceA: faceA.faceIndex.toString(),
			faceB: faceB.faceIndex.toString(),
			offsetA: new THREE.Vector3(),
			offsetB: new THREE.Vector3(),
			constraintType: 'fixed'
		};

		editorState.addConstraint(newConstraintNode);
	}
</script>

<button
	class="inline-flex h-8 items-center justify-center rounded-md px-3 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
	onclick={() => (playTest.active ? stopPlayTest() : startPlayTest())}
>
	{playTest.active ? 'Stop' : 'Run'}
</button>
<p>{playTest.active}</p>
<div class={playTest.active ? 'hidden' : ''}>
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
</div>

{#if playTest.active && playTest.scene && playTest.camera}
	<div class="m-4 rounded border-2 border-green-500 p-4">
		<p>play testing</p>
		<div class="h-96">
			<Renderer
				scene={playTest.scene}
				camera={playTest.camera}
				{editorState}
				addLights={false}
				backgroundColor={COLORS.sky}
				orbitTarget={new THREE.Vector3(0, 1, 0)}
				orbitMinDistance={3}
				orbitMaxDistance={20}
				orbitMaxPolarAngle={Math.PI / 2.2}
			/>
		</div>
	</div>
{/if}

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

	<button onclick={() => addConstraint()} class="border p-2">do a constraint thingy!!!!!!!</button>
</div>
