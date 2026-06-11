<script lang="ts">
	import { onMount } from 'svelte';
	import * as THREE from 'three';
	import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
	import Module from 'manifold-3d';
	import { draggable } from '@neodrag/svelte';
	import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
	import TWEEN from '@tweenjs/tween.js';
	import {
		editor,
		EditorState,
		gameAssets,
		type Model,
		type PartNode,
		type ConstraintNode
	} from '$lib/stores/editor.svelte';
	import {
		Box,
		Circle,
		Layers,
		Triangle,
		Orbit,
		Square,
		Combine,
		Minus,
		Link2,
		Eye,
		EyeOff,
		Undo2,
		Redo2,
		Copy,
		Scissors,
		ClipboardPaste,
		Trash2
	} from '@lucide/svelte';
	import Renderer, {
		getFaceEdgesGeometry,
		type RendererContext
	} from '$lib/components/editor/Renderer.svelte';

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

	let nextManifoldID = 1;
	const manifoldMaterialMap = new Map<number, THREE.Material>();

	const editorState = editor.tabs.find((t) => t.type === 'model')!;

	const scene = new THREE.Scene();
	const camera = new THREE.PerspectiveCamera(60, RES_W / RES_H, 0.1, 1000);
	camera.position.set(6, 5, 8);
	camera.lookAt(0, 0, 0);

	let renderer: THREE.WebGLRenderer;
	let ManifoldClass: any;
	let ManifoldMeshClass: any;

	let selectionMode = $state<'part' | 'face'>('part');
	let currentTool = $state<'select' | 'move' | 'rotate' | 'scale'>('select');

	const FACE_NORMALS: Record<string, THREE.Vector3> = {
		top: new THREE.Vector3(0, 1, 0),
		bottom: new THREE.Vector3(0, -1, 0),
		front: new THREE.Vector3(0, 0, 1),
		back: new THREE.Vector3(0, 0, -1),
		left: new THREE.Vector3(-1, 0, 0),
		right: new THREE.Vector3(1, 0, 0)
	};

	function getFaceWorldPosition(
		obj: THREE.Object3D,
		face: string,
		offset: THREE.Vector3
	): THREE.Vector3 {
		const box = new THREE.Box3().setFromObject(obj);
		const center = new THREE.Vector3();
		box.getCenter(center);
		const size = new THREE.Vector3();
		box.getSize(size);

		const normal = FACE_NORMALS[face] ?? FACE_NORMALS.top;
		const faceCenter = center
			.clone()
			.add(
				new THREE.Vector3((size.x / 2) * normal.x, (size.y / 2) * normal.y, (size.z / 2) * normal.z)
			);

		return faceCenter.add(offset);
	}

	function getFaceCenterWorld(mesh: THREE.Mesh, faceIndex: number): THREE.Vector3 {
		const faceGeo = getFaceEdgesGeometry(mesh.geometry, faceIndex);
		if (!faceGeo) return new THREE.Vector3();
		const pos = faceGeo.attributes.position;
		const center = new THREE.Vector3();
		for (let i = 0; i < pos.count; i++) {
			center.x += pos.getX(i);
			center.y += pos.getY(i);
			center.z += pos.getZ(i);
		}
		center.divideScalar(pos.count);
		mesh.updateWorldMatrix(true, false);
		center.applyMatrix4(mesh.matrixWorld);
		return center;
	}

	function updateConstraintVisuals() {
		if (!scene) return;
		for (const c of editorState.constraints) {
			if (c.faceA === 'selected') continue;
			const partA = editorState.parts.find((p) => p.id === c.partAId);
			const partB = editorState.parts.find((p) => p.id === c.partBId);
			if (!partA || !partB) continue;

			const posA = getFaceWorldPosition(partA.object3D, c.faceA, c.offsetA);
			const posB = getFaceWorldPosition(partB.object3D, c.faceB, c.offsetB);

			if (c.sphereA) c.sphereA.position.copy(posA);
			if (c.sphereB) c.sphereB.position.copy(posB);
			if (c.line) {
				const pos = c.line.geometry.attributes.position;
				pos.setXYZ(0, posA.x, posA.y, posA.z);
				pos.setXYZ(1, posB.x, posB.y, posB.z);
				pos.needsUpdate = true;
			}
		}
	}

	let placing: boolean = $state(false);
	let placingObjType: string = $state('box');
	let placingObj: THREE.Object3D | null = $state(null);
	let placedObjColorTween: TWEEN.Tween | null = $state(null);

	type IsolationMode = 'hidden' | 'transparent';

	let isolationEnabled = $state(false);
	let isolationMode = $state<IsolationMode>('transparent');
	let isolatedIds: string[] = $state([]);

	let contextMenu = $state({ visible: false, x: 0, y: 0, partId: '' });

	function visibleParts() {
		if (!isolationEnabled) return editorState.parts;
		return editorState.parts.filter((p) => isolatedIds.includes(p.id));
	}

	function toggleIsolateSelected() {
		const next = [...isolatedIds];
		for (const id of editorState.selectedIds) {
			const idx = next.indexOf(id);
			idx >= 0 ? next.splice(idx, 1) : next.push(id);
		}
		isolatedIds = next;
	}

	function toggleIsolation() {
		isolationEnabled = !isolationEnabled;
	}

	function toggleIsolationMode() {
		isolationMode = isolationMode === 'hidden' ? 'transparent' : 'hidden';
	}

	function showContextMenu(e: MouseEvent, partId: string) {
		e.preventDefault();
		editorState.select(partId);
		contextMenu = { visible: true, x: e.clientX, y: e.clientY, partId };
	}

	function hideContextMenu() {
		contextMenu = { visible: false, x: 0, y: 0, partId: '' };
	}

	function contextCopy() {
		editorState.copySelected();
		hideContextMenu();
	}

	function contextCut() {
		editorState.cutSelected();
		hideContextMenu();
	}

	function contextPaste() {
		pasteFromClipboard();
		hideContextMenu();
	}

	function contextDelete() {
		editorState.pushUndo();
		for (const id of [...editorState.selectedIds]) {
			const part = editorState.parts.find((p) => p.id === id);
			if (part && part.object3D.parent) {
				part.object3D.parent.remove(part.object3D);
			}
			editorState.removePart(id);
		}
		hideContextMenu();
	}

	function pasteFromClipboard() {
		const entries = editorState.getClipboardEntries();
		if (entries.length === 0) return;
		editorState.pushUndo();
		editorState.deselectAll();
		for (const entry of entries) {
			let geometry: THREE.BufferGeometry;
			switch (entry.geometryType) {
				case 'SphereGeometry':
					geometry = new THREE.SphereGeometry(0.5, 12, 8);
					break;
				case 'CylinderGeometry':
					geometry = new THREE.CylinderGeometry(0.5, 0.5, 1, 8);
					break;
				case 'ConeGeometry':
					geometry = new THREE.ConeGeometry(0.5, 1, 8);
					break;
				case 'TorusGeometry':
					geometry = new THREE.TorusGeometry(0.5, 0.2, 8, 12);
					break;
				case 'PlaneGeometry':
					geometry = new THREE.PlaneGeometry(1, 1);
					break;
				default:
					geometry = new THREE.BoxGeometry(1, 1, 1);
			}
			const rawGeo = geometry.clone();
			const material = new THREE.MeshStandardMaterial({ color: 0xa0a0a0 });
			const mesh = new THREE.Mesh(geometry, material);
			mesh.position.set(entry.position.x + 1, entry.position.y, entry.position.z + 1);
			mesh.rotation.set(entry.rotation.x, entry.rotation.y, entry.rotation.z);
			mesh.scale.set(entry.scale.x, entry.scale.y, entry.scale.z);
			const id = partId();
			mesh.userData.partId = id;
			const matMap = new Map<number, THREE.Material>();
			matMap.set(0, material);
			editorState.addPart({
				id,
				name: entry.name + ' (copy)',
				type: 'part',
				object3D: mesh,
				rawGeometry: rawGeo,
				materialMap: matMap
			});
			editorState.toggleSelect(id);
			scene.add(mesh);
		}
	}

	$effect(() => {
		const _enabled = isolationEnabled;
		const _mode = isolationMode;
		const _ids = isolatedIds;
		for (const part of editorState.parts) {
			const isolated = _ids.includes(part.id);
			if (!_enabled || isolated) {
				part.object3D.visible = true;
				part.object3D.traverse((child: THREE.Object3D) => {
					if (child instanceof THREE.Mesh) {
						const mats = Array.isArray(child.material) ? child.material : [child.material];
						for (const m of mats) {
							m.transparent = false;
							m.opacity = 1;
							m.needsUpdate = true;
						}
					}
				});
			} else if (_mode === 'hidden') {
				part.object3D.visible = false;
			} else {
				part.object3D.visible = true;
				part.object3D.traverse((child: THREE.Object3D) => {
					if (child instanceof THREE.Mesh) {
						const mats = Array.isArray(child.material) ? child.material : [child.material];
						for (const m of mats) {
							m.transparent = true;
							m.opacity = 0.1;
							m.needsUpdate = true;
						}
					}
				});
			}
		}
	});

	function filterIsolated<T extends { object: THREE.Object3D }>(hits: T[]): T[] {
		if (!isolationEnabled) return hits;
		return hits.filter((hit) => {
			let obj: THREE.Object3D | null = hit.object;
			while (obj && !obj.userData.partId) obj = obj.parent;
			return obj !== null && isolatedIds.includes(obj.userData.partId);
		});
	}

	function partId(): string {
		return crypto.randomUUID();
	}

	function startPlacing(obj: string) {
		placingObjType = obj;
		placing = true;

		const material = new THREE.MeshStandardMaterial({ color: 0xa0a0a0, transparent: true });
		let geometry: THREE.BufferGeometry;

		switch (obj) {
			case 'box':
				geometry = new THREE.BoxGeometry(1, 1, 1);
				break;
			case 'sphere':
				geometry = new THREE.SphereGeometry(0.5, 12, 8);
				break;
			case 'cylinder':
				geometry = new THREE.CylinderGeometry(0.5, 0.5, 1, 8);
				break;
			case 'cone':
				geometry = new THREE.ConeGeometry(0.5, 1, 8);
				break;
			case 'torus':
				geometry = new THREE.TorusGeometry(0.5, 0.2, 8, 12);
				break;
			case 'plane':
				geometry = new THREE.PlaneGeometry(1, 1);
				break;
			default:
				geometry = new THREE.BoxGeometry(1, 1, 1);
		}

		placingObj = new THREE.Mesh(geometry, material);
		scene.add(placingObj);
	}

	$effect(() => {
		if (!scene) return;
		const activeIds = new Set(editorState.constraints.map((c) => c.id));
		const toRemove: THREE.Object3D[] = [];
		scene.traverse((child: THREE.Object3D) => {
			if (child.userData.constraintId && !activeIds.has(child.userData.constraintId)) {
				toRemove.push(child);
			}
		});
		toRemove.forEach((child) => {
			child.parent?.remove(child);
		});
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
			let intersects = raycaster.intersectObjects(scene.children, true);

			for (let i = intersects.length - 1; i >= 0; i--) {
				if (intersects[i].object === placingObj) {
					intersects.splice(i, 1);
				}
			}

			intersects = filterIsolated(intersects);

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
			const rawGeo = mesh.geometry.clone();
			const clonedMat = (mesh.material as THREE.MeshStandardMaterial).clone();
			const newPart = new THREE.Mesh(rawGeo.clone(), clonedMat);
			newPart.position.copy(placingObj.position);

			const id = partId();
			const partName = placingObjType.charAt(0).toUpperCase() + placingObjType.slice(1);
			newPart.userData.partId = id;
			const matMap = new Map<number, THREE.Material>();
			matMap.set(0, clonedMat);
			editorState.addPart({
				id,
				name: partName,
				type: 'part',
				object3D: newPart,
				rawGeometry: rawGeo,
				materialMap: matMap
			});
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

	function handleRendererReady(ctx: RendererContext) {
		renderer = ctx.renderer;

		const studMat = new THREE.MeshStandardMaterial({ color: COLORS.stud });
		const studTopMat = new THREE.MeshStandardMaterial({ color: COLORS.studTop });

		const studBodyGeo = new THREE.BoxGeometry(0.9, 0.4, 0.9);
		const studTopGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.08, 8);

		const studBody = new THREE.Mesh(studBodyGeo, studMat);
		studBody.position.y = -0.3;
		const studTop = new THREE.Mesh(studTopGeo, studTopMat);
		studTop.position.y = -0.1;

		const mergedRawGeo = mergeGeometries([
			studBodyGeo.clone().translate(0, -0.3, 0),
			studTopGeo.clone().translate(0, -0.1, 0)
		]);

		const studRawMatMap = new Map<number, THREE.Material>();
		studRawMatMap.set(0, studMat);
		studRawMatMap.set(1, studTopMat);

		const stud = new THREE.Group();
		const studId = partId();
		stud.userData.partId = studId;
		editorState.addPart({
			id: studId,
			name: 'Stud',
			type: 'part',
			object3D: stud,
			rawGeometry: mergedRawGeo,
			materialMap: studRawMatMap
		});
		editorState.select(studId);

		stud.add(studBody);
		stud.add(studTop);
		scene.add(stud);
	}

	function handleUpdate() {
		placedObjColorTween?.update();
		updateConstraintVisuals();
	}

	onMount(() => {
		Module().then((wasm) => {
			wasm.setup();
			ManifoldClass = wasm.Manifold;
			ManifoldMeshClass = wasm.Mesh;
		});

		function handleKey(event: KeyboardEvent) {
			if (event.key === 'i') {
				isolatedIds = [...editorState.selectedIds];
				toggleIsolation();
			}

			if (event.ctrlKey || event.metaKey) {
				if (event.key === 'c') {
					event.preventDefault();
					editorState.copySelected();
				} else if (event.key === 'v') {
					event.preventDefault();
					pasteFromClipboard();
				} else if (event.key === 'x') {
					event.preventDefault();
					editorState.cutSelected();
				} else if (event.key === 'z') {
					event.preventDefault();
					editorState.undo();
				} else if (event.key === 'y') {
					event.preventDefault();
					editorState.redo();
				}
			}

			if (event.key === 'Delete' && editorState.selectedIds.length > 0) {
				editorState.pushUndo();
				for (const id of [...editorState.selectedIds]) {
					const part = editorState.parts.find((p) => p.id === id);
					if (part && part.object3D.parent) {
						part.object3D.parent.remove(part.object3D);
					}
					editorState.removePart(id);
				}
			}
		}

		document.addEventListener('keydown', handleKey);

		return () => {
			document.removeEventListener('keydown', handleKey);
			editorState.parts.forEach((part) => {
				if (part.object3D.parent === scene) {
					scene.remove(part.object3D);
					editorState.removePart(part.id);
				}
			});
		};
	});

	function geometry2manifoldMesh(geometry: THREE.BufferGeometry, id = 0): any {
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
			runOriginalID: new Uint32Array([id])
		});
		mesh.merge();
		return mesh;
	}

	function manifoldResultToThreeJS(
		resultMesh: any,
		materialMap: Map<number, THREE.Material>
	): {
		rawGeometry: THREE.BufferGeometry;
		materials: THREE.Material[];
		groups: Array<{ start: number; count: number; materialIndex: number }>;
	} {
		const materials: THREE.Material[] = [];
		const idToMatIndex = new Map<number, number>();

		for (let run = 0; run < resultMesh.numRun; run++) {
			const partID = resultMesh.runOriginalID[run];
			if (!idToMatIndex.has(partID)) {
				const sourceMat = materialMap.get(partID);
				idToMatIndex.set(partID, materials.length);
				materials.push(
					sourceMat ? sourceMat.clone() : new THREE.MeshStandardMaterial({ color: 0xa0a0a0 })
				);
			}
		}

		const rawGeometry = new THREE.BufferGeometry();
		rawGeometry.setAttribute('position', new THREE.BufferAttribute(resultMesh.vertProperties, 3));
		rawGeometry.setIndex(new THREE.BufferAttribute(resultMesh.triVerts, 1));

		const groups: Array<{ start: number; count: number; materialIndex: number }> = [];

		if (resultMesh.numRun > 0) {
			let currentID = resultMesh.runOriginalID[0];
			let groupStart = resultMesh.runIndex[0];

			for (let run = 0; run < resultMesh.numRun; run++) {
				const nextID = resultMesh.runOriginalID[run + 1];
				if (nextID !== currentID) {
					const groupEnd = resultMesh.runIndex[run + 1];
					groups.push({
						start: groupStart,
						count: groupEnd - groupStart,
						materialIndex: idToMatIndex.get(currentID)!
					});
					currentID = nextID;
					groupStart = groupEnd;
				}
			}
		}

		return { rawGeometry, materials, groups };
	}

	function manifoldFromObject(object: THREE.Object3D): any {
		let geometry: THREE.BufferGeometry;
		let material: THREE.Material | null = null;

		if (object instanceof THREE.Mesh) {
			geometry = object.geometry.clone();
			geometry.applyMatrix4(object.matrixWorld);
			const objMat = object.material as THREE.Material | THREE.Material[];
			material = Array.isArray(objMat) ? objMat[0] : objMat;
		} else {
			const geometries: THREE.BufferGeometry[] = [];
			object.traverse((child) => {
				if (child instanceof THREE.Mesh) {
					const cloned = child.geometry.clone();
					cloned.applyMatrix4(child.matrixWorld);
					geometries.push(cloned);
					if (!material) {
						const childMat = child.material as THREE.Material | THREE.Material[];
						material = Array.isArray(childMat) ? childMat[0] : childMat;
					}
				}
			});
			if (geometries.length === 0) throw new Error('No mesh geometry found');
			geometry = geometries.length === 1 ? geometries[0] : mergeGeometries(geometries);
		}

		const id = nextManifoldID++;
		if (material) manifoldMaterialMap.set(id, material);

		const mesh = geometry2manifoldMesh(geometry, id);
		return new ManifoldClass(mesh);
	}

	function setOriginToGeometryCenter(mesh: THREE.Mesh) {
		mesh.geometry.computeBoundingBox();
		const center = new THREE.Vector3();
		mesh.geometry.boundingBox.getCenter(center);
		mesh.geometry.center();
		mesh.position.add(center);
	}

	function addition() {
		if (!ManifoldClass) return;

		const parts = editorState.selectedParts;
		if (parts.length < 2) {
			alert('Select at least 2 parts for CSG operations');
			return;
		}
		const [partA, partB] = parts;

		const manifoldA = manifoldFromObject(partA.object3D);
		const manifoldB = manifoldFromObject(partB.object3D);

		let resultManifold: any;
		try {
			resultManifold = ManifoldClass.union(manifoldA, manifoldB);
		} catch (e) {
			alert('CSG operation failed: ' + e);
			return;
		}

		const resultMeshData = resultManifold.getMesh();
		const { rawGeometry, materials, groups } = manifoldResultToThreeJS(
			resultMeshData,
			manifoldMaterialMap
		);

		const csgMaterialMap = new Map<number, THREE.Material>();
		for (const g of groups) {
			if (!csgMaterialMap.has(g.materialIndex) && materials[g.materialIndex]) {
				csgMaterialMap.set(g.materialIndex, materials[g.materialIndex]);
			}
		}

		const cleanGeometry = BufferGeometryUtils.mergeVertices(rawGeometry, 0.0001);
		for (const g of groups) {
			cleanGeometry.addGroup(g.start, g.count, g.materialIndex);
		}
		cleanGeometry.computeVertexNormals();

		const matArray =
			materials.length > 0 ? materials : [new THREE.MeshStandardMaterial({ color: 0xa0a0a0 })];
		const resultMesh = new THREE.Mesh(cleanGeometry, matArray);
		for (const mat of matArray) {
			mat.flatShading = true;
			mat.needsUpdate = true;
		}

		const id = partId();
		resultMesh.userData.partId = id;
		const newPart = editorState.addPart({
			id,
			name: 'CSG Result',
			type: 'part',
			object3D: resultMesh,
			rawGeometry: rawGeometry.clone(),
			materialMap: csgMaterialMap
		});
		editorState.select(id);
		scene.add(resultMesh);

		resultMesh.updateMatrixWorld();
		const inverseMatrix = new THREE.Matrix4().copy(resultMesh.matrixWorld).invert();
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

		setOriginToGeometryCenter(resultMesh);
	}

	function subtract() {
		if (!ManifoldClass) return;

		if (editorState.selectedParts.length !== 2) {
			alert('Select exactly 2 parts for CSG operations');
			return;
		}
		const [partA, partB] = editorState.selectedParts;

		const manifoldA = manifoldFromObject(partA.object3D);
		const manifoldB = manifoldFromObject(partB.object3D);

		let resultManifold: any;
		try {
			resultManifold = ManifoldClass.difference(manifoldA, manifoldB);
		} catch (e) {
			alert('CSG operation failed: ' + e);
			return;
		}

		const resultMeshData = resultManifold.getMesh();
		const { rawGeometry, materials, groups } = manifoldResultToThreeJS(
			resultMeshData,
			manifoldMaterialMap
		);

		const csgMaterialMap = new Map<number, THREE.Material>();
		for (const g of groups) {
			if (!csgMaterialMap.has(g.materialIndex) && materials[g.materialIndex]) {
				csgMaterialMap.set(g.materialIndex, materials[g.materialIndex]);
			}
		}

		const cleanGeometry = BufferGeometryUtils.mergeVertices(rawGeometry, 0.0001);
		for (const g of groups) {
			cleanGeometry.addGroup(g.start, g.count, g.materialIndex);
		}
		cleanGeometry.computeVertexNormals();

		const matArray =
			materials.length > 0 ? materials : [new THREE.MeshStandardMaterial({ color: 0xa0a0a0 })];
		const resultMesh = new THREE.Mesh(cleanGeometry, matArray);
		for (const mat of matArray) {
			mat.flatShading = true;
			mat.needsUpdate = true;
		}

		const id = partId();
		resultMesh.userData.partId = id;
		const newPart = editorState.addPart({
			id,
			name: 'CSG Result',
			type: 'part',
			object3D: resultMesh,
			rawGeometry: rawGeometry.clone(),
			materialMap: csgMaterialMap
		});
		editorState.select(id);
		scene.add(resultMesh);

		resultMesh.updateMatrixWorld();
		const inverseMatrix = new THREE.Matrix4().copy(resultMesh.matrixWorld).invert();
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

		setOriginToGeometryCenter(resultMesh);
	}

	function addFixedConstraint() {
		if (!scene) return;

		const parts = editorState.selectedParts;
		const faces = editorState.selectedFaces;

		if (parts.length !== 2 || faces.length !== 2) {
			alert('Select exactly 2 faces to create a constraint');
			return;
		}

		const [partA, partB] = parts;
		const [faceDataA, faceDataB] = faces;

		const posA = getFaceCenterWorld(faceDataA.mesh, faceDataA.faceIndex);
		const posB = getFaceCenterWorld(faceDataB.mesh, faceDataB.faceIndex);

		const sphereGeo = new THREE.SphereGeometry(0.025, 8, 8);
		const sphereMat = new THREE.MeshBasicMaterial({
			color: 0xff4444,
			depthTest: false,
			depthWrite: false
		});
		const sphereA = new THREE.Mesh(sphereGeo, sphereMat);
		const sphereB = new THREE.Mesh(sphereGeo.clone(), sphereMat.clone());
		sphereA.position.copy(posA);
		sphereB.position.copy(posB);

		const lineGeo = new THREE.BufferGeometry().setFromPoints([posA, posB]);
		const lineMat = new THREE.LineBasicMaterial({
			color: 0x0044ff,
			depthTest: false,
			depthWrite: false
		});
		const line = new THREE.Line(lineGeo, lineMat);

		const constraintId = partId();
		sphereA.userData.constraintId = constraintId;
		sphereB.userData.constraintId = constraintId;
		line.userData.constraintId = constraintId;

		scene.add(sphereA);
		scene.add(sphereB);
		scene.add(line);

		const constraint: ConstraintNode = {
			id: constraintId,
			name: `Fixed (${partA.name} ↔ ${partB.name})`,
			type: 'constraint',
			partAId: partA.id,
			partBId: partB.id,
			faceA: 'selected',
			faceB: 'selected',
			offsetA: new THREE.Vector3(),
			offsetB: new THREE.Vector3(),
			constraintType: 'fixed',
			line,
			sphereA,
			sphereB
		};

		editorState.addConstraint(constraint);
		editorState.select(constraintId);
	}

	let modelName = $state('Unnamed Model');
	let modelAsset: Model | undefined = $state(undefined);

	function saveModel() {
		if (!modelAsset) {
			modelAsset = {
				id: crypto.randomUUID(),
				name: modelName,
				parts: [],
				constraints: []
			};

			gameAssets.addModel(modelAsset);
		}

		modelAsset.name = modelName;
		modelAsset.parts = editorState.parts;
		modelAsset.constraints = editorState.constraints;

		gameAssets.updateModel(modelAsset);
		console.log('Model saved:', modelAsset);
		console.log('All models:', gameAssets.models);
	}

	function applyTexture(textureId: string) {
		if (!scene) return;

		if (editorState.selectedFaces.length === 0) {
			alert('Select faces to apply the texture to');
			return;
		}

		const face = editorState.selectedFaces[0];
		const part = editorState.selectedParts[0];
		const texture = gameAssets.textures.find((t) => t.id === textureId);

		if (!texture) {
			alert('Texture not found');
			return;
		}

		const mesh = face.mesh;
		const geometry = mesh.geometry;
		const groups = geometry.groups;

		let groupIndex = 0;
		if (groups && groups.length > 0) {
			const triIndex = face.faceIndex * 3;
			for (let i = 0; i < groups.length; i++) {
				if (triIndex >= groups[i].start && triIndex < groups[i].start + groups[i].count) {
					groupIndex = i;
					break;
				}
			}
		}

		const loadedMap = new THREE.TextureLoader().load(texture.imageData);

		let matMap = part.materialMap;
		if (!matMap) {
			matMap = new Map<number, THREE.Material>();
			part.materialMap = matMap;
		}

		if (matMap.has(groupIndex)) {
			const oldMat = matMap.get(groupIndex)!;
			const newMat = oldMat.clone();
			newMat.map = loadedMap;
			newMat.needsUpdate = true;
			matMap.set(groupIndex, newMat);
		} else {
			matMap.set(groupIndex, new THREE.MeshStandardMaterial({ map: loadedMap }));
		}

		const numGroups = groups && groups.length > 0 ? groups.length : 1;
		const matArray: THREE.Material[] = [];
		const currentMats = mesh.material;
		for (let i = 0; i < numGroups; i++) {
			if (matMap.has(i)) {
				matArray.push(matMap.get(i)!);
			} else if (Array.isArray(currentMats) && currentMats[i]) {
				matArray.push(currentMats[i]);
			} else if (!Array.isArray(currentMats) && currentMats) {
				matArray.push(currentMats);
			} else {
				matArray.push(new THREE.MeshStandardMaterial({ color: 0xa0a0a0 }));
			}
		}
		mesh.material = matArray;
	}
</script>

<svelte:window onclick={hideContextMenu} />

<Renderer
	{scene}
	{camera}
	{editorState}
	addLights={true}
	backgroundColor={0x505050}
	bind:selectionMode
	bind:currentTool
	getVisibleParts={() => visibleParts()}
	{filterIsolated}
	{placing}
	{placingObj}
	onEscape={hideContextMenu}
	onReady={handleRendererReady}
	onUpdate={handleUpdate}
/>

<input bind:value={modelName} type="text" placeholder="Model Name" class="border p-2" />
<button onclick={saveModel} class="border p-2">Save</button>

<div class="flex flex-col gap-5 p-3">
	<div>
		<div class="border">
			<div class="w-fit border-r {selectionMode === 'part' ? 'bg-blue-500' : ''}">Parts</div>
			<div class="w-fit {selectionMode === 'face' ? 'bg-blue-500' : ''}">Faces</div>
		</div>

		<div class="border">
			<div class="w-fit {currentTool === 'select' ? 'bg-blue-500' : ''}">Select</div>
			<div class="w-fit {currentTool === 'move' ? 'bg-blue-500' : ''}">Move</div>
			<div class="w-fit {currentTool === 'rotate' ? 'bg-blue-500' : ''}">Rotate</div>
			<div class="w-fit {currentTool === 'scale' ? 'bg-blue-500' : ''}">Scale</div>
		</div>

		<div class="my-2 flex gap-1">
			<button
				onclick={() => editorState.undo()}
				disabled={!editorState.canUndo}
				class="flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
				title="Undo (Ctrl+Z)"
			>
				<Undo2 class="h-3.5 w-3.5" />
			</button>
			<button
				onclick={() => editorState.redo()}
				disabled={!editorState.canRedo}
				class="flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
				title="Redo (Ctrl+Y)"
			>
				<Redo2 class="h-3.5 w-3.5" />
			</button>
		</div>

		<div>
			<div class="mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
				Texture Assets ({gameAssets.textures.length})
			</div>
			<div class="space-y-1">
				{#each gameAssets.textures as texture (texture.id)}
					<div class="flex items-center justify-between gap-2 rounded border px-2 py-1 text-sm">
						<span class="truncate">{texture.name}</span>
						<button class="border p-2" onclick={() => applyTexture(texture.id)}>Apply</button>
					</div>
				{/each}
				{#if gameAssets.textures.length === 0}
					<p class="px-1 py-2 text-xs text-muted-foreground">No saved textures</p>
				{/if}
			</div>
		</div>

		<div class="relative h-96 w-96">
			<div
				class="absolute h-5 w-5 cursor-move rounded-full bg-blue-500 shadow"
				use:draggable={{ axis: 'both', bounds: 'parent', grid: [5, 5] }}
			></div>

			<img src="/terrain.png" class="inline h-full w-full" />
		</div>

		<div class="mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
			Primitives
		</div>
		<div class="grid grid-cols-3 gap-1.5">
			<button
				onclick={() => startPlacing('box')}
				class="flex flex-col items-center gap-1 rounded px-3 py-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
			>
				<Box class="h-4 w-4" />
				<span>Box</span>
			</button>
			<button
				onclick={() => startPlacing('sphere')}
				class="flex flex-col items-center gap-1 rounded px-3 py-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
			>
				<Circle class="h-4 w-4" />
				<span>Sphere</span>
			</button>
			<button
				onclick={() => startPlacing('cylinder')}
				class="flex flex-col items-center gap-1 rounded px-3 py-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
			>
				<Layers class="h-4 w-4" />
				<span>Cylinder</span>
			</button>
			<button
				onclick={() => startPlacing('cone')}
				class="flex flex-col items-center gap-1 rounded px-3 py-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
			>
				<Triangle class="h-4 w-4" />
				<span>Cone</span>
			</button>
			<button
				onclick={() => startPlacing('torus')}
				class="flex flex-col items-center gap-1 rounded px-3 py-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
			>
				<Orbit class="h-4 w-4" />
				<span>Torus</span>
			</button>
			<button
				onclick={() => startPlacing('plane')}
				class="flex flex-col items-center gap-1 rounded px-3 py-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
			>
				<Square class="h-4 w-4" />
				<span>Plane</span>
			</button>
		</div>
	</div>

	<div>
		<div class="mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
			CSG Operations
		</div>
		<div class="flex gap-1.5">
			<button
				onclick={addition}
				class="flex items-center gap-1.5 rounded px-3 py-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
			>
				<Combine class="h-4 w-4" />
				<span>Union</span>
			</button>
			<button
				onclick={subtract}
				class="flex items-center gap-1.5 rounded px-3 py-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
			>
				<Minus class="h-4 w-4" />
				<span>Subtract</span>
			</button>
		</div>
	</div>

	<div>
		<div class="mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
			Constraints
		</div>
		<div class="flex gap-1.5">
			<button
				onclick={addFixedConstraint}
				class="flex items-center gap-1.5 rounded px-3 py-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
			>
				<Link2 class="h-4 w-4" />
				<span>Fixed</span>
			</button>
		</div>
	</div>

	<div>
		<div class="mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
			Isolation
		</div>
		<div class="flex flex-wrap gap-1.5">
			<button
				onclick={toggleIsolation}
				class="flex items-center gap-1.5 rounded px-3 py-2 text-xs {isolationEnabled
					? 'bg-accent text-accent-foreground'
					: 'text-muted-foreground hover:bg-accent hover:text-foreground'}"
			>
				{#if isolationEnabled}
					<EyeOff class="h-4 w-4" />
				{:else}
					<Eye class="h-4 w-4" />
				{/if}
				<span>{isolationEnabled ? 'On' : 'Off'}</span>
			</button>
			<button
				onclick={toggleIsolateSelected}
				disabled={!isolationEnabled}
				class="flex items-center gap-1.5 rounded px-3 py-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
			>
				<EyeOff class="h-4 w-4" />
				<span>Toggle</span>
			</button>
			<button
				onclick={toggleIsolationMode}
				disabled={!isolationEnabled}
				class="flex items-center gap-1.5 rounded px-3 py-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
			>
				<span>{isolationMode === 'hidden' ? 'Hidden' : 'Ghost'}</span>
			</button>
		</div>
	</div>
</div>

{#if contextMenu.visible}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div
		role="menu"
		tabindex="-1"
		class="fixed z-50 min-w-[160px] rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
		style="left: {contextMenu.x}px; top: {contextMenu.y}px;"
		onclick={(e) => e.stopPropagation()}
		oncontextmenu={(e) => e.preventDefault()}
	>
		<button
			onclick={contextCopy}
			class="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground"
		>
			<Copy class="h-3.5 w-3.5" />
			<span>Copy</span>
			<span class="ml-auto text-muted-foreground">Ctrl+C</span>
		</button>
		<button
			onclick={contextCut}
			class="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground"
		>
			<Scissors class="h-3.5 w-3.5" />
			<span>Cut</span>
			<span class="ml-auto text-muted-foreground">Ctrl+X</span>
		</button>
		<button
			onclick={contextPaste}
			disabled={!editorState.hasClipboard}
			class="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-40"
		>
			<ClipboardPaste class="h-3.5 w-3.5" />
			<span>Paste</span>
			<span class="ml-auto text-muted-foreground">Ctrl+V</span>
		</button>
		<div class="my-1 h-px bg-muted"></div>
		<button
			onclick={contextDelete}
			class="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs text-destructive hover:bg-destructive hover:text-destructive-foreground"
		>
			<Trash2 class="h-3.5 w-3.5" />
			<span>Delete</span>
			<span class="ml-auto text-muted-foreground">Del</span>
		</button>
	</div>
{/if}
