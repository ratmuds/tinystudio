<script lang="ts">
	import { onMount } from 'svelte';
	import * as THREE from 'three';
	import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
	import { FlyControls } from 'three/addons/controls/FlyControls.js';
	import { TransformControls } from 'three/addons/controls/TransformControls.js';
	import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
	import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
	import { OutlinePass } from 'three/addons/postprocessing/OutlinePass.js';
	import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
	import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
	import Module from 'manifold-3d';
	import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
	import TWEEN from '@tweenjs/tween.js';
	import { editorState, type PartNode, type ConstraintNode } from '$lib/stores/editor.svelte';
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
	let container: HTMLDivElement;

	let scene: THREE.Scene;
	let camera: THREE.PerspectiveCamera;
	let renderer: THREE.WebGLRenderer;
	let ManifoldClass: any;
	let ManifoldMeshClass: any;
	let mousePos = new THREE.Vector2();

	let selectionMode: 'part' | 'face' = $state('part');
	let currentTool: 'select' | 'move' | 'rotate' | 'scale' = $state('select');

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

	function getFaceEdgesGeometry(
		geometry: THREE.BufferGeometry,
		faceIndex: number
	): THREE.BufferGeometry | null {
		const indexAttr = geometry.index;
		const positionAttr = geometry.attributes.position;

		const a = indexAttr ? indexAttr.getX(faceIndex * 3) : faceIndex * 3;
		const b = indexAttr ? indexAttr.getY(faceIndex * 3) : faceIndex * 3 + 1;
		const c = indexAttr ? indexAttr.getZ(faceIndex * 3) : faceIndex * 3 + 2;

		const aPos = new THREE.Vector3().fromBufferAttribute(positionAttr, a);
		const bPos = new THREE.Vector3().fromBufferAttribute(positionAttr, b);
		const cPos = new THREE.Vector3().fromBufferAttribute(positionAttr, c);

		const faceNormal = new THREE.Vector3()
			.subVectors(bPos, aPos)
			.cross(new THREE.Vector3().subVectors(cPos, aPos))
			.normalize();

		const d = faceNormal.dot(aPos);
		const connectedIndices: number[] = [];
		const triCount = indexAttr ? indexAttr.count / 3 : positionAttr.count / 3;

		for (let i = 0; i < triCount; i++) {
			const ai = indexAttr ? indexAttr.getX(i * 3) : i * 3;
			const bi = indexAttr ? indexAttr.getY(i * 3) : i * 3 + 1;
			const ci = indexAttr ? indexAttr.getZ(i * 3) : i * 3 + 2;

			const aPi = new THREE.Vector3().fromBufferAttribute(positionAttr, ai);
			const bPi = new THREE.Vector3().fromBufferAttribute(positionAttr, bi);
			const cPi = new THREE.Vector3().fromBufferAttribute(positionAttr, ci);

			const triNormal = new THREE.Vector3()
				.subVectors(bPi, aPi)
				.cross(new THREE.Vector3().subVectors(cPi, aPi))
				.normalize();

			if (faceNormal.angleTo(triNormal) < 0.01 && Math.abs(triNormal.dot(aPi) - d) < 1e-4) {
				connectedIndices.push(ai, bi, ci);
			}
		}

		if (connectedIndices.length < 3) return null;

		const verts: number[] = [];
		for (const vi of connectedIndices) {
			verts.push(positionAttr.getX(vi), positionAttr.getY(vi), positionAttr.getZ(vi));
		}

		const geo = new THREE.BufferGeometry();
		geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
		return geo;
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
	let transformControls: TransformControls;
	let outlinePass: OutlinePass;
	let hoverOutlinePass: OutlinePass;
	let faceHighlight: THREE.LineSegments | null = null;
	let selectedFaceHighlights: THREE.LineSegments[] = [];

	// --- Isolation ---
	type IsolationMode = 'hidden' | 'transparent';

	let isolationEnabled = $state(false);
	let isolationMode = $state<IsolationMode>('transparent');
	let isolatedIds: string[] = $state([]);

	// --- Context Menu ---
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

	// --- Context Menu & Clipboard ---
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
			const material = new THREE.MeshStandardMaterial({ color: 0xa0a0a0 });
			const mesh = new THREE.Mesh(geometry, material);
			mesh.position.set(entry.position.x + 1, entry.position.y, entry.position.z + 1);
			mesh.rotation.set(entry.rotation.x, entry.rotation.y, entry.rotation.z);
			mesh.scale.set(entry.scale.x, entry.scale.y, entry.scale.z);
			const id = partId();
			mesh.userData.partId = id;
			editorState.addPart({ id, name: entry.name + ' (copy)', type: 'part', object3D: mesh });
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
		const ids = editorState.selectedIds;
		if (!outlinePass || !transformControls) return;

		const first = editorState.firstSelectedNode;
		if (first && first.type === 'part') {
			const objs = editorState.selectedParts.map((p) => p.object3D);
			outlinePass.selectedObjects = objs;
			transformControls.attach(first.object3D);
		} else {
			outlinePass.selectedObjects = [];
			transformControls.detach();
		}
	});

	$effect(() => {
		console.log('selected faces changed', editorState.selectedFaces);
		if (!scene) return;

		const highlights: THREE.LineSegments[] = [];

		for (let i = 0; i < editorState.selectedIds.length; i++) {
			const faceData = editorState.selectedFaces[i];
			console.log('faceData', faceData);
			if (!faceData) continue;
			const mesh = faceData.mesh;
			if (!mesh?.geometry) continue;
			const faceGeo = getFaceEdgesGeometry(mesh.geometry, faceData.faceIndex);
			if (!faceGeo) continue;
			const edgesGeo = new THREE.EdgesGeometry(faceGeo, 0.1);
			const highlight = new THREE.LineSegments(
				edgesGeo,
				new THREE.LineBasicMaterial({ color: 0x44ff44 })
			);
			highlight.position.add(mesh.position);
			mesh.add(highlight);
			highlights.push(highlight);
			scene.add(highlight);
		}

		const oldHighlights = selectedFaceHighlights;
		selectedFaceHighlights = highlights;

		oldHighlights.forEach((h) => {
			h.parent?.remove(h);
			h.geometry.dispose();
		});

		return () => {
			for (const h of oldHighlights) {
				h.parent?.remove(h);
				h.geometry.dispose();
			}
		};
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
				const partsList = visibleParts().map((p) => p.object3D);
				const intersects = raycaster.intersectObjects(partsList, true);
				if (intersects.length === 0) {
					//editorState.deselectAll();
					return;
				}

				let part = intersects[0].object;
				while (part && !part.userData.partId) {
					part = part.parent!;
				}
				if (part && part.userData.partId) {
					if (event.shiftKey) {
						if (selectionMode === 'face') {
							const faceIndex = intersects[0].faceIndex ?? 0;
							const hitMesh = intersects[0].object as THREE.Mesh;
							editorState.toggleSelect(part.userData.partId, faceIndex, hitMesh);
							console.log('toggled face selection', part.userData.partId, faceIndex);
						} else {
							editorState.toggleSelect(part.userData.partId);
						}
					} else {
						if (selectionMode === 'face') {
							const faceIndex = intersects[0].faceIndex ?? 0;
							const hitMesh = intersects[0].object as THREE.Mesh;
							editorState.select(part.userData.partId, faceIndex, hitMesh);
							console.log('selected face', part.userData.partId, faceIndex);
						} else {
							editorState.select(part.userData.partId);
						}
					}
				}
			}

			function handleKey(event: KeyboardEvent) {
				if (event.key === 'Escape') {
					console.log('esc pressed');
					editorState.deselectAll();
					hideContextMenu();
				}

				if (event.key === 'Tab') {
					event.preventDefault();
					selectionMode = selectionMode === 'part' ? 'face' : 'part';
				}

				if (event.key === 'i') {
					// Add currently selected to isolation list
					isolatedIds = [...editorState.selectedIds];

					toggleIsolation();
				}

				if (event.key === '1') {
					currentTool = 'select';
					transformControls.detach();
				} else if (event.key === '2') {
					currentTool = 'move';
					if (editorState.firstSelectedNode?.type === 'part') {
						transformControls.attach(editorState.firstSelectedNode.object3D);
						transformControls.setMode('translate');
					}
				} else if (event.key === '3') {
					currentTool = 'rotate';
					if (editorState.firstSelectedNode?.type === 'part') {
						transformControls.attach(editorState.firstSelectedNode.object3D);
						transformControls.setMode('rotate');
					}
				} else if (event.key === '4') {
					currentTool = 'scale';
					if (editorState.firstSelectedNode?.type === 'part') {
						transformControls.attach(editorState.firstSelectedNode.object3D);
						transformControls.setMode('scale');
					}
				}

				// Ctrl shortcuts
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

				// Delete key
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

			renderer.domElement.addEventListener('mousedown', handlePartClick);
			document.addEventListener('keydown', handleKey);

			cleanup = () => {
				renderer.domElement.removeEventListener('mousedown', handlePartClick);
				document.removeEventListener('keydown', handleKey);
			};
		}, 100);

		return () => {
			clearTimeout(timer);
			cleanup?.();
		};
	});

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
			const newPart = new THREE.Mesh(
				mesh.geometry.clone(),
				(mesh.material as THREE.MeshStandardMaterial).clone()
			);
			newPart.position.copy(placingObj.position);

			const id = partId();
			const partName = placingObjType.charAt(0).toUpperCase() + placingObjType.slice(1);
			newPart.userData.partId = id;
			editorState.addPart({ id, name: partName, type: 'part', object3D: newPart });
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
		controls.enableDamping = true;
		controls.dampingFactor = 0.05;
		controls.minDistance = 1;
		controls.maxDistance = 200;
		controls.update();

		transformControls = new TransformControls(camera, renderer.domElement);
		scene.add(transformControls.getHelper());

		transformControls.addEventListener('mouseDown', () => {
			controls.enabled = false;
			editorState.pushUndo();
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
		editorState.addPart({ id: studId, name: 'Stud', type: 'part', object3D: stud });
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

		// Retro Color Quantization Shader
		const RetroColorShader = {
			uniforms: {
				tDiffuse: { value: null },
				colorLevels: { value: 8.0 } // Number of color steps per channel (R, G, B)
			},
			vertexShader: `
				varying vec2 vUv;
				void main() {
					vUv = uv;
					gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
				}
			`,
			fragmentShader: `
				uniform sampler2D tDiffuse;
				uniform float colorLevels;
				varying vec2 vUv;

				void main() {
					vec4 color = texture2D(tDiffuse, vUv);
					
					// Quantize colors (limit the range)
					vec3 quantizedColor = floor(color.rgb * colorLevels) / (colorLevels - 1.0);
					
					gl_FragColor = vec4(quantizedColor, color.a);
				}
			`
		};

		// Add to your EffectComposer
		const retroPass = new ShaderPass(RetroColorShader);
		retroPass.uniforms.colorLevels.value = 12.0; // 4 levels = 64 possible colors
		composer.addPass(retroPass);

		outlinePass = new OutlinePass(
			new THREE.Vector2(window.innerWidth, window.innerHeight),
			scene,
			camera
		);
		composer.addPass(outlinePass);

		outlinePass.selectedObjects = [stud];
		outlinePass.visibleEdgeColor = new THREE.Color(0x00bbff);

		hoverOutlinePass = new OutlinePass(
			new THREE.Vector2(window.innerWidth, window.innerHeight),
			scene,
			camera
		);
		composer.addPass(hoverOutlinePass);

		hoverOutlinePass.selectedObjects = [];
		hoverOutlinePass.visibleEdgeColor = new THREE.Color(0xaaaaaa);

		// Every 250ms check if hovering over a part and update hoverOutlinePass
		let hoverCheckInterval = setInterval(() => {
			if (!renderer || !camera || !scene || placing) return;

			const rect = renderer.domElement.getBoundingClientRect();
			const mouse = new THREE.Vector2(
				((mousePos.x - rect.left) / rect.width) * 2 - 1,
				-((mousePos.y - rect.top) / rect.height) * 2 + 1
			);
			const raycaster = new THREE.Raycaster();
			raycaster.setFromCamera(mouse, camera);
			const partsList = visibleParts().map((p) => p.object3D);
			const intersects = raycaster.intersectObjects(partsList, true);

			for (let i = intersects.length - 1; i >= 0; i--) {
				if (intersects[i].object === placingObj) {
					intersects.splice(i, 1);
				}
			}

			if (intersects.length > 0) {
				let part = intersects[0].object;
				while (part && !part.userData.partId) {
					part = part.parent!;
				}
				if (part && part.userData.partId) {
					hoverOutlinePass.selectedObjects = [part];
				} else {
					hoverOutlinePass.selectedObjects = [];
				}
			} else {
				hoverOutlinePass.selectedObjects = [];
			}

			// Check for faces hovering
			if (intersects.length > 0) {
				const hit = intersects[0];
				const mesh = hit.object;
				const geometry = mesh.geometry;
				const positionAttr = geometry.attributes.position;
				const indexAttr = geometry.index; // Check if geometry uses indices

				const faceNormal = hit.face?.normal;

				// Plane constant for the hit face: d = n · P
				let d_hit = 0;
				if (faceNormal && hit.face) {
					const hitA = new THREE.Vector3().fromBufferAttribute(positionAttr, hit.face.a);
					d_hit = faceNormal.dot(hitA);
				}

				// Array to hold all vertex indices that belong to this multi-sided face
				const connectedVertexIndices: number[] = [];

				// Loop through every triangle in the geometry to see if it sits on the same plane
				const triangleCount = indexAttr ? indexAttr.count / 3 : positionAttr.count / 3;

				for (let i = 0; i < triangleCount; i++) {
					// Get the 3 vertex indices for the current triangle
					const a = indexAttr ? indexAttr.getX(i * 3) : i * 3;
					const b = indexAttr ? indexAttr.getY(i * 3) : i * 3 + 1;
					const c = indexAttr ? indexAttr.getZ(i * 3) : i * 3 + 2;

					const aPos = new THREE.Vector3().fromBufferAttribute(positionAttr, a);
					const bPos = new THREE.Vector3().fromBufferAttribute(positionAttr, b);
					const cPos = new THREE.Vector3().fromBufferAttribute(positionAttr, c);

					const triNormal = new THREE.Vector3()
						.subVectors(bPos, aPos)
						.cross(new THREE.Vector3().subVectors(cPos, aPos))
						.normalize();

					if (
						faceNormal &&
						triNormal.angleTo(faceNormal) < 0.01 &&
						Math.abs(triNormal.dot(aPos) - d_hit) < 1e-4
					) {
						connectedVertexIndices.push(a, b, c);
					}
				}

				if (connectedVertexIndices.length >= 3) {
					const faceVerts: number[] = [];
					for (const vi of connectedVertexIndices) {
						faceVerts.push(positionAttr.getX(vi), positionAttr.getY(vi), positionAttr.getZ(vi));
					}
					const faceGeo = new THREE.BufferGeometry();
					faceGeo.setAttribute('position', new THREE.Float32BufferAttribute(faceVerts, 3));
					const edgesGeo = new THREE.EdgesGeometry(faceGeo, 0.1);
					if (faceHighlight) scene.remove(faceHighlight);
					faceHighlight = new THREE.LineSegments(
						edgesGeo,
						new THREE.LineBasicMaterial({ color: 0xffff00 })
					);
					mesh.getWorldPosition(faceHighlight.position);
					mesh.getWorldQuaternion(faceHighlight.quaternion);
					mesh.getWorldScale(faceHighlight.scale);
					scene.add(faceHighlight);
				} else if (faceHighlight) {
					scene.remove(faceHighlight);
					faceHighlight = null;
				}
			} else if (faceHighlight) {
				scene.remove(faceHighlight);
				faceHighlight = null;
			}
		}, 100);

		// Create event listener to track mouse position for hover outline
		function onMouseMoveMousePos(event: MouseEvent) {
			mousePos.set(event.clientX, event.clientY);
		}
		renderer.domElement.addEventListener('mousemove', onMouseMoveMousePos);

		function animate() {
			placedObjColorTween?.update();
			updateConstraintVisuals();
			controls.update();
			composer.render();
		}
		renderer.setAnimationLoop(animate);

		return () => {
			if (faceHighlight) {
				scene.remove(faceHighlight);
				faceHighlight = null;
			}
			for (const h of selectedFaceHighlights) {
				h.parent?.remove(h);
				h.geometry.dispose();
			}
			selectedFaceHighlights = [];
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

	/**
	 * Converts a Three.js geometry into a Manifold Mesh for CSG.
	 *
	 * The `id` parameter tags every triangle in this mesh with a unique number.
	 * When Manifold runs a CSG operation, each output triangle keeps the ID of
	 * whichever input part it came from. Later we look up that ID to find the
	 * right material — that's how materials survive union/subtract/etc.
	 */
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
		// Collect one material per unique part ID
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

		// Step 2: Build the raw geometry (no groups yet)
		const rawGeometry = new THREE.BufferGeometry();
		rawGeometry.setAttribute('position', new THREE.BufferAttribute(resultMesh.vertProperties, 3));
		rawGeometry.setIndex(new THREE.BufferAttribute(resultMesh.triVerts, 1));

		// Step 3: Figure out which triangles use which material
		// Consecutive runs with the same ID get merged into one group.
		// The arrays have (numRun + 1) entries. The last one is a sentinel
		// that makes the final group get created.
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
			// Single mesh: clone and bake world position into the vertices
			geometry = object.geometry.clone();
			geometry.applyMatrix4(object.matrixWorld);
			const objMat = object.material as THREE.Material | THREE.Material[];
			material = Array.isArray(objMat) ? objMat[0] : objMat;
		} else {
			// Group: merge all child mesh geometries into one
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

		// Give this part a unique ID and remember its material
		const id = nextManifoldID++;
		if (material) manifoldMaterialMap.set(id, material);

		// Convert to Manifold, tagging every triangle with this part's ID
		const mesh = geometry2manifoldMesh(geometry, id);
		return new ManifoldClass(mesh);
	}

	function setOriginToGeometryCenter(mesh: THREE.Mesh) {
		// 1. Calculate the center of the geometry's bounding box
		mesh.geometry.computeBoundingBox();
		const center = new THREE.Vector3();
		mesh.geometry.boundingBox.getCenter(center);

		// 2. Shift the geometry vertices back to the local origin
		mesh.geometry.center();

		// 3. Offset the mesh's position to keep it in the same world location
		mesh.position.add(center);
	}

	/**
	 * Union of two selected parts. The result keeps both materials.
	 */
	function addition() {
		if (!ManifoldClass) return;

		const parts = editorState.selectedParts;
		if (parts.length < 2) {
			alert('Select at least 2 parts for CSG operations');
			return;
		}
		const [partA, partB] = parts;

		// Convert each Three.js part into a Manifold
		// Each part gets a unique numeric ID
		const manifoldA = manifoldFromObject(partA.object3D);
		const manifoldB = manifoldFromObject(partB.object3D);

		// Run the CSG union
		let resultManifold: any;
		try {
			resultManifold = ManifoldClass.union(manifoldA, manifoldB);
		} catch (e) {
			alert('CSG operation failed: ' + e);
			return;
		}

		// Convert back to Three.js, keeping both materials
		// The result mesh has triangle runs tagged with each source part's ID
		// manifoldResultToThreeJS reads those IDs and gives us the right materials
		const resultMeshData = resultManifold.getMesh();
		const { rawGeometry, materials, groups } = manifoldResultToThreeJS(
			resultMeshData,
			manifoldMaterialMap
		);

		// Clean up geometry
		const cleanGeometry = BufferGeometryUtils.mergeVertices(rawGeometry, 0.0001);
		for (const g of groups) {
			cleanGeometry.addGroup(g.start, g.count, g.materialIndex);
		}
		cleanGeometry.computeVertexNormals();

		// Build the Three.js mesh
		const matArray =
			materials.length > 0 ? materials : [new THREE.MeshStandardMaterial({ color: 0xa0a0a0 })];
		const resultMesh = new THREE.Mesh(cleanGeometry, matArray);
		for (const mat of matArray) {
			mat.flatShading = true;
			mat.needsUpdate = true;
		}

		// Register the new combined part
		const id = partId();
		resultMesh.userData.partId = id;
		const newPart = editorState.addPart({
			id,
			name: 'CSG Result',
			type: 'part',
			object3D: resultMesh
		});
		editorState.select(id);
		scene.add(resultMesh);

		// Track offsets for future CSG operations
		resultMesh.updateMatrixWorld();
		const inverseMatrix = new THREE.Matrix4().copy(resultMesh.matrixWorld).invert();
		partA.CSGOffset = partA.object3D
			.getWorldPosition(new THREE.Vector3())
			.applyMatrix4(inverseMatrix);
		partB.CSGOffset = partB.object3D
			.getWorldPosition(new THREE.Vector3())
			.applyMatrix4(inverseMatrix);
		newPart.CSGHistory = [partA, partB];

		// Remove the original parts
		scene.remove(partA.object3D);
		scene.remove(partB.object3D);
		editorState.removePart(partA.id);
		editorState.removePart(partB.id);

		// Center the result
		setOriginToGeometryCenter(resultMesh);
	}

	/**
	 * Subtract partB from partA. The result keeps materials from both parts.
	 */
	function subtract() {
		if (!ManifoldClass) return;

		if (editorState.selectedParts.length !== 2) {
			alert('Select exactly 2 parts for CSG operations');
			return;
		}
		const [partA, partB] = editorState.selectedParts;

		// Convert each part into a Manifold
		const manifoldA = manifoldFromObject(partA.object3D);
		const manifoldB = manifoldFromObject(partB.object3D);

		// Run the CSG difference
		let resultManifold: any;
		try {
			resultManifold = ManifoldClass.difference(manifoldA, manifoldB);
		} catch (e) {
			alert('CSG operation failed: ' + e);
			return;
		}

		// Convert back to Three.js, keeping materials
		const resultMeshData = resultManifold.getMesh();
		const { rawGeometry, materials, groups } = manifoldResultToThreeJS(
			resultMeshData,
			manifoldMaterialMap
		);

		// Clean up geometry
		const cleanGeometry = BufferGeometryUtils.mergeVertices(rawGeometry, 0.0001);
		for (const g of groups) {
			cleanGeometry.addGroup(g.start, g.count, g.materialIndex);
		}
		cleanGeometry.computeVertexNormals();

		// Build the Three.js mesh
		const matArray =
			materials.length > 0 ? materials : [new THREE.MeshStandardMaterial({ color: 0xa0a0a0 })];
		const resultMesh = new THREE.Mesh(cleanGeometry, matArray);
		for (const mat of matArray) {
			mat.flatShading = true;
			mat.needsUpdate = true;
		}

		// Register the new part
		const id = partId();
		resultMesh.userData.partId = id;
		const newPart = editorState.addPart({
			id,
			name: 'CSG Result',
			type: 'part',
			object3D: resultMesh
		});
		editorState.select(id);
		scene.add(resultMesh);

		// Track offsets
		resultMesh.updateMatrixWorld();
		const inverseMatrix = new THREE.Matrix4().copy(resultMesh.matrixWorld).invert();
		partA.CSGOffset = partA.object3D
			.getWorldPosition(new THREE.Vector3())
			.applyMatrix4(inverseMatrix);
		partB.CSGOffset = partB.object3D
			.getWorldPosition(new THREE.Vector3())
			.applyMatrix4(inverseMatrix);
		newPart.CSGHistory = [partA, partB];

		// Remove originals
		scene.remove(partA.object3D);
		scene.remove(partB.object3D);
		editorState.removePart(partA.id);
		editorState.removePart(partB.id);

		// Center
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
</script>

<svelte:window onclick={hideContextMenu} />

<div
	bind:this={container}
	class="flex h-full items-center justify-center overflow-hidden bg-[#87ceeb]"
></div>

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
