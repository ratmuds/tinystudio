<script lang="ts">
	import { onMount } from 'svelte';
	import * as THREE from 'three';
	import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
	import { TransformControls } from 'three/addons/controls/TransformControls.js';
	import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
	import { OutlinePass } from 'three/addons/postprocessing/OutlinePass.js';
	import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
	import Module from 'manifold-3d';
	import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
	import TWEEN from '@tweenjs/tween.js';
	import { editorState, type EditorPart } from '$lib/stores/editor.svelte';

	const RES_W = 320;
	const RES_H = 240;
	const COLORS = {
		sky: 0x202020,
		grass: 0x7cc46b,
		stud: 0xe8b84b,
		studTop: 0xf5d06f,
		trunk: 0x8b5e3c,
		leaves: 0x5da13d,
		sun: 0xffee88
	};

	let container: HTMLDivElement;

	let scene: THREE.Scene;
	let camera: THREE.PerspectiveCamera;
	let renderer: THREE.WebGLRenderer;
	let ManifoldClass: any;
	let ManifoldMeshClass: any;

	let placing: boolean = $state(false);
	let placingObjType: string = $state('box');
	let placingObj: THREE.Object3D | null = $state(null);
	let placedObjColorTween: TWEEN.Tween | null = $state(null);
	let transformControls: TransformControls;
	let outlinePass: OutlinePass;

	function partId(): string {
		return crypto.randomUUID();
	}

	function startPlacing(obj: string) {
		placingObjType = obj;
		placing = true;

		if (obj === 'box') {
			const geometry = new THREE.BoxGeometry(1, 1, 1);
			const material = new THREE.MeshStandardMaterial({ color: 0xa0a0a0, transparent: true });
			placingObj = new THREE.Mesh(geometry, material);
			scene.add(placingObj);
		}
	}

	$effect(() => {
		const ids = editorState.selectedIds;
		if (!outlinePass || !transformControls) return;

		const objs = editorState.selectedParts.map((p) => p.object3D);
		outlinePass.selectedObjects = objs;

		const first = editorState.firstSelectedPart;
		if (first) {
			transformControls.attach(first.object3D);
		} else {
			transformControls.detach();
		}
	});

	$effect(() => {
		let cleanup: (() => void) | undefined;
		const timer = setTimeout(() => {
			if (!renderer || !camera || !scene) return;

			function handlePartClick(event: MouseEvent) {
				if (placing) return;

				const rect = renderer.domElement.getBoundingClientRect();
				const mouse = new THREE.Vector2(
					((event.clientX - rect.left) / rect.width) * 2 - 1,
					-((event.clientY - rect.top) / rect.height) * 2 + 1
				);
				const raycaster = new THREE.Raycaster();
				raycaster.setFromCamera(mouse, camera);
				const partsList = editorState.parts.map((p) => p.object3D);
				const intersects = raycaster.intersectObjects(partsList, true);
				if (intersects.length === 0) {
					editorState.deselectAll();
					return;
				}

				let part = intersects[0].object;
				while (part && !part.userData.partId) {
					part = part.parent!;
				}
				if (part && part.userData.partId) {
					if (event.shiftKey) {
						editorState.toggleSelect(part.userData.partId);
					} else {
						editorState.select(part.userData.partId);
					}
				}
			}

			renderer.domElement.addEventListener('mousedown', handlePartClick);
			cleanup = () => {
				renderer.domElement.removeEventListener('mousedown', handlePartClick);
			};
		}, 100);

		return () => {
			clearTimeout(timer);
			cleanup?.();
		};
	});

	$effect(() => {
		if (!placing || !renderer || !camera || !scene || !placingObj) return;

		const raycaster = new THREE.Raycaster();
		raycaster.far = 50;
		const mouse = new THREE.Vector2();
		const intersectPoint = new THREE.Vector3();

		function onMouseMove(event: MouseEvent) {
			if (!renderer || !camera || !scene || !placingObj || !placing) return;

			const rect = renderer.domElement.getBoundingClientRect();
			mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
			mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

			raycaster.setFromCamera(mouse, camera);
			const intersects = raycaster.intersectObjects(scene.children, true);

			for (let i = intersects.length - 1; i >= 0; i--) {
				if (intersects[i].object === placingObj) {
					intersects.splice(i, 1);
				}
			}

			if (intersects.length > 0) {
				intersectPoint.copy(intersects[0].point).floor().addScalar(0.5);
			} else {
				intersectPoint
					.copy(raycaster.ray.origin)
					.addScaledVector(raycaster.ray.direction, raycaster.far);
			}

			placingObj.position.copy(intersectPoint);
		}

		function onMouseDown() {
			const mesh = placingObj as THREE.Mesh;
			const newPart = new THREE.Mesh(
				mesh.geometry.clone(),
				(mesh.material as THREE.MeshStandardMaterial).clone()
			);
			newPart.position.copy(placingObj.position);

			const id = partId();
			newPart.userData.partId = id;
			editorState.addPart({ id, name: 'Box', object3D: newPart });
			editorState.select(id);

			scene.add(newPart);

			const mat = newPart.material as THREE.MeshStandardMaterial;
			const origColor = { r: mat.color.r, g: mat.color.g, b: mat.color.b };
			const brightColor = { r: origColor.r + 0.5, g: origColor.g + 0.5, b: origColor.b + 0.5 };
			mat.color.setRGB(brightColor.r, brightColor.g, brightColor.b);

			placedObjColorTween = new TWEEN.Tween(brightColor)
				.to(origColor, 1000)
				.easing(TWEEN.Easing.Quadratic.Out)
				.onUpdate(() => {
					mat.color.setRGB(brightColor.r, brightColor.g, brightColor.b);
				})
				.start();

			placing = false;
			scene.remove(placingObj);
		}

		renderer.domElement.addEventListener('mousemove', onMouseMove);
		renderer.domElement.addEventListener('mousedown', onMouseDown);

		return () => {
			renderer.domElement.removeEventListener('mousemove', onMouseMove);
			renderer.domElement.removeEventListener('mousedown', onMouseDown);
		};
	});

	onMount(() => {
		scene = new THREE.Scene();
		scene.background = new THREE.Color(0x505050);

		camera = new THREE.PerspectiveCamera(60, RES_W / RES_H, 0.1, 1000);
		camera.position.set(6, 5, 8);
		camera.lookAt(0, 0, 0);

		renderer = new THREE.WebGLRenderer({ antialias: false });
		renderer.setSize(RES_W, RES_H);
		renderer.setPixelRatio(1);
		renderer.domElement.style.imageRendering = 'pixelated';
		renderer.domElement.style.width = '100%';
		renderer.domElement.style.height = '100%';
		renderer.domElement.style.touchAction = 'none';
		container.appendChild(renderer.domElement);

		// Initialize Manifold WASM
		Module().then((wasm) => {
			wasm.setup();
			ManifoldClass = wasm.Manifold;
			ManifoldMeshClass = wasm.Mesh;
		});

		const controls = new OrbitControls(camera, renderer.domElement);
		controls.target.set(0, 1, 0);
		controls.enableDamping = true;
		controls.dampingFactor = 0.05;
		controls.minDistance = 3;
		controls.maxDistance = 20;
		controls.update();

		transformControls = new TransformControls(camera, renderer.domElement);
		scene.add(transformControls.getHelper());

		transformControls.addEventListener('mouseDown', () => {
			controls.enabled = false;
		});
		transformControls.addEventListener('mouseUp', () => {
			controls.enabled = true;
		});

		const ambientLight = new THREE.AmbientLight(0xffffff, 1.25);
		scene.add(ambientLight);
		const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
		directionalLight.position.set(5, 10, 7.5);
		scene.add(directionalLight);

		const stud = new THREE.Group();
		const studId = partId();
		stud.userData.partId = studId;
		editorState.addPart({ id: studId, name: 'Stud', object3D: stud });
		editorState.select(studId);

		const studMat = new THREE.MeshStandardMaterial({ color: COLORS.stud });
		const studTopMat = new THREE.MeshStandardMaterial({ color: COLORS.studTop });
		const studBody = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.4, 0.9), studMat);
		studBody.position.y = -0.3;
		stud.add(studBody);
		const studTop = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.08, 8), studTopMat);
		studTop.position.y = -0.1;
		stud.add(studTop);
		scene.add(stud);

		const composer = new EffectComposer(renderer);

		const renderPass = new RenderPass(scene, camera);
		renderPass.background = new THREE.Color(COLORS.sky);
		composer.addPass(renderPass);

		outlinePass = new OutlinePass(
			new THREE.Vector2(window.innerWidth, window.innerHeight),
			scene,
			camera
		);
		composer.addPass(outlinePass);

		outlinePass.selectedObjects = [stud];
		outlinePass.visibleEdgeColor = new THREE.Color(0x00bbff);

		function animate() {
			placedObjColorTween?.update();
			controls.update();
			composer.render();
		}
		renderer.setAnimationLoop(animate);

		return () => {
			editorState.parts.forEach((part) => {
				if (part.object3D.parent === scene) {
					scene.remove(part.object3D);
					editorState.removePart(part.id);
				}
			});
			renderer.dispose();
			container.removeChild(renderer.domElement);
		};
	});

	function geometry2manifoldMesh(geometry: THREE.BufferGeometry): any {
		const vertProperties = new Float32Array(geometry.attributes.position.array);
		const numVert = geometry.attributes.position.count;
		let triVerts: Uint32Array;
		if (geometry.index != null) {
			triVerts = new Uint32Array(geometry.index.array);
		} else {
			triVerts = new Uint32Array(Array.from({ length: numVert }, (_, i) => i));
		}
		const mesh = new ManifoldMeshClass({
			numProp: 3,
			vertProperties,
			triVerts,
			runIndex: new Uint32Array([0]),
			runOriginalID: new Uint32Array([0])
		});
		mesh.merge();
		return mesh;
	}

	function mesh2geometry(mesh: any): THREE.BufferGeometry {
		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute('position', new THREE.BufferAttribute(mesh.vertProperties, 3));
		geometry.setIndex(new THREE.BufferAttribute(mesh.triVerts, 1));
		geometry.computeVertexNormals();
		return geometry;
	}

	function manifoldFromObject(object: THREE.Object3D): any {
		let geometry: THREE.BufferGeometry;

		if (object instanceof THREE.Mesh) {
			geometry = object.geometry.clone();
			geometry.applyMatrix4(object.matrixWorld);
		} else {
			const geometries: THREE.BufferGeometry[] = [];
			object.traverse((child) => {
				if (child instanceof THREE.Mesh) {
					const cloned = child.geometry.clone();
					cloned.applyMatrix4(child.matrixWorld);
					geometries.push(cloned);
				}
			});
			if (geometries.length === 0) throw new Error('No mesh geometry found');
			geometry = geometries.length === 1 ? geometries[0] : mergeGeometries(geometries);
		}

		const mesh = geometry2manifoldMesh(geometry);
		return new ManifoldClass(mesh);
	}

	function addition() {
		if (!ManifoldClass) {
			return;
		}

		const parts = editorState.selectedParts;

		if (parts.length < 2) {
			alert('Select at least 2 parts for CSG operations');
			return;
		}

		const [partA, partB] = parts;

		const manifoldA = manifoldFromObject(partA.object3D);
		const manifoldB = manifoldFromObject(partB.object3D);

		let resultGeometry: THREE.BufferGeometry;
		try {
			resultGeometry = mesh2geometry(ManifoldClass.union(manifoldA, manifoldB).getMesh());
		} catch (e) {
			alert('CSG operation failed: ' + e);
			return;
		}

		const resultMesh = new THREE.Mesh(
			resultGeometry,
			partA.object3D instanceof THREE.Mesh
				? (partA.object3D.material as THREE.Material).clone()
				: new THREE.MeshStandardMaterial({ color: 0xa0a0a0 })
		);

		const id = partId();
		resultMesh.userData.partId = id;
		const newPart = editorState.addPart({ id, name: 'CSG Result', object3D: resultMesh });
		editorState.select(id);
		scene.add(resultMesh);

		const inverseMatrix = new THREE.Matrix4().getInverse(resultMesh.matrixWorld);
		partA.CSGOffset = partA.object3D
			.getWorldPosition(new THREE.Vector3())
			.applyMatrix4(inverseMatrix);
		partB.CSGOffset = partB.object3D
			.getWorldPosition(new THREE.Vector3())
			.applyMatrix4(inverseMatrix);

		newPart.CSGHistory = [partA, partB];

		scene.remove(partA.object3D);
		scene.remove(partB.object3D);
		editorState.removePart(partA.id);
		editorState.removePart(partB.id);
	}

	function subtract() {
		if (!ManifoldClass) {
			return;
		}

		if (editorState.selectedParts.length !== 2) {
			alert('Select exactly 2 parts for CSG operations');
			return;
		}

		const [partA, partB] = editorState.selectedParts;

		const manifoldA = manifoldFromObject(partA.object3D);
		const manifoldB = manifoldFromObject(partB.object3D);

		let resultGeometry: THREE.BufferGeometry;
		try {
			resultGeometry = mesh2geometry(ManifoldClass.difference(manifoldA, manifoldB).getMesh());
		} catch (e) {
			alert('CSG operation failed: ' + e);
			return;
		}

		const resultMesh = new THREE.Mesh(
			resultGeometry,
			partB.object3D instanceof THREE.Mesh
				? (partB.object3D.material as THREE.Material).clone()
				: new THREE.MeshStandardMaterial({ color: 0xa0a0a0 })
		);

		const id = partId();
		resultMesh.userData.partId = id;
		const newPart = editorState.addPart({ id, name: 'CSG Result', object3D: resultMesh });
		editorState.select(id);

		scene.add(resultMesh);

		const inverseMatrix = new THREE.Matrix4().getInverse(resultMesh.matrixWorld);
		partA.CSGOffset = partA.object3D
			.getWorldPosition(new THREE.Vector3())
			.applyMatrix4(inverseMatrix);
		partB.CSGOffset = partB.object3D
			.getWorldPosition(new THREE.Vector3())
			.applyMatrix4(inverseMatrix);

		newPart.CSGHistory = [partA, partB];

		scene.remove(partA.object3D);
		scene.remove(partB.object3D);
		editorState.removePart(partA.id);
		editorState.removePart(partB.id);
	}
</script>

<div
	bind:this={container}
	class="flex h-full items-center justify-center overflow-hidden bg-[#87ceeb]"
></div>

<br />

<p>Part placement</p>

<button class="border p-2" onclick={() => startPlacing('box')}>add box</button>

<br />

<p>CSG tools</p>

<button class="border p-2" onclick={addition}>add (union)</button>
<button class="border p-2" onclick={subtract}>subtract</button>

<p>Constraint Tools</p>
<button class="border p-2" onclick={() => alert('Not implemented yet')}>fixed</button>
