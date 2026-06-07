<script lang="ts">
	import { onMount } from 'svelte';
	import * as THREE from 'three';
	import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
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
		Link2
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

	let container: HTMLDivElement;

	let scene: THREE.Scene;
	let camera: THREE.PerspectiveCamera;
	let renderer: THREE.WebGLRenderer;
	let ManifoldClass: any;
	let ManifoldMeshClass: any;
	let mousePos = new THREE.Vector2();
	let keys = new Set<string>();

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

	function updateConstraintVisuals() {
		if (!scene) return;
		for (const c of editorState.constraints) {
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
					//editorState.deselectAll();
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

			function handleEscape(event: KeyboardEvent) {
				if (event.key === 'Escape') {
					console.log('esc pressed');
					editorState.deselectAll();
				}
			}

			renderer.domElement.addEventListener('mousedown', handlePartClick);
			document.addEventListener('keydown', handleEscape);

			cleanup = () => {
				renderer.domElement.removeEventListener('mousedown', handlePartClick);
				document.removeEventListener('keydown', handleEscape);
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
			const partsList = editorState.parts.map((p) => p.object3D);
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

		resultMesh.material.flatShading = true;
		resultMesh.material.needsUpdate = true;

		// Recompute normals
		resultMesh.geometry.deleteAttribute('normal');
		resultMesh.geometry.computeVertexNormals();

		// Clean up geometry
		const cleanGeometry = BufferGeometryUtils.mergeVertices(resultMesh.geometry, 0.0001);
		cleanGeometry.computeVertexNormals();
		resultMesh.geometry = cleanGeometry;

		// Create part
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

		// Calculate CSG offsets for original parts
		resultMesh.updateMatrixWorld();
		const inverseMatrix = new THREE.Matrix4().copy(resultMesh.matrixWorld).invert();
		partA.CSGOffset = partA.object3D
			.getWorldPosition(new THREE.Vector3())
			.applyMatrix4(inverseMatrix);
		partB.CSGOffset = partB.object3D
			.getWorldPosition(new THREE.Vector3())
			.applyMatrix4(inverseMatrix);

		newPart.CSGHistory = [partA, partB];

		// Remove original parts
		scene.remove(partA.object3D);
		scene.remove(partB.object3D);
		editorState.removePart(partA.id);
		editorState.removePart(partB.id);

		// Center mesh to geometry
		setOriginToGeometryCenter(resultMesh);
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

		resultMesh.material.flatShading = true;
		resultMesh.material.needsUpdate = true;

		// Recompute normals
		resultMesh.geometry.deleteAttribute('normal');
		resultMesh.geometry.computeVertexNormals();

		// Clean up geometry
		const cleanGeometry = BufferGeometryUtils.mergeVertices(resultMesh.geometry, 0.0001);
		cleanGeometry.computeVertexNormals();
		resultMesh.geometry = cleanGeometry;

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

		// Center mesh to geometry
		setOriginToGeometryCenter(resultMesh);
	}

	function addFixedConstraint() {
		if (!scene) return;

		const parts = editorState.selectedParts;
		if (parts.length !== 2) {
			alert('Select exactly 2 parts to create a constraint');
			return;
		}

		const [partA, partB] = parts;

		const posA = getFaceWorldPosition(partA.object3D, 'top', new THREE.Vector3());
		const posB = getFaceWorldPosition(partB.object3D, 'top', new THREE.Vector3());

		const sphereGeo = new THREE.SphereGeometry(0.08, 8, 8);
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
			color: 0xff4444,
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
			faceA: 'top',
			faceB: 'top',
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

<div
	bind:this={container}
	class="flex h-full items-center justify-center overflow-hidden bg-[#87ceeb]"
></div>

<div class="flex flex-col gap-5 p-3">
	<div>
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
</div>
