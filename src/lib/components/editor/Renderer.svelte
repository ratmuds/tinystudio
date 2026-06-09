<script lang="ts" module>
	export function getFaceEdgesGeometry(
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
</script>

<script lang="ts">
	import { onMount } from 'svelte';
	import * as THREE from 'three';
	import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
	import { TransformControls } from 'three/addons/controls/TransformControls.js';
	import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
	import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
	import { OutlinePass } from 'three/addons/postprocessing/OutlinePass.js';
	import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
	import { EditorState } from '$lib/stores/editor.svelte';

	const RES_W = 320;
	const RES_H = 240;

	const RetroColorShader = {
		uniforms: {
			tDiffuse: { value: null },
			colorLevels: { value: 8.0 }
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
				vec3 quantizedColor = floor(color.rgb * colorLevels) / (colorLevels - 1.0);
				gl_FragColor = vec4(quantizedColor, color.a);
			}
		`
	};

	export interface RendererContext {
		renderer: THREE.WebGLRenderer;
		composer: EffectComposer;
		controls: OrbitControls;
		container: HTMLDivElement;
		transformControls: TransformControls;
	}

	let {
		scene,
		camera,
		onReady,
		onUpdate,
		backgroundColor = 0x505050,
		orbitTarget = new THREE.Vector3(0, 0, 0),
		orbitDamping = true,
		orbitDampingFactor = 0.05,
		orbitMinDistance = 1,
		orbitMaxDistance = 200,
		orbitMaxPolarAngle = Math.PI,
		addLights = false,
		selectionMode = $bindable<'part' | 'face'>('part'),
		currentTool = $bindable<'select' | 'move' | 'rotate' | 'scale'>('select'),
		getVisibleParts = () => [] as { object3D: THREE.Object3D }[],
		filterIsolated = <T extends { object: THREE.Object3D }>(hits: T[]) => hits,
		placing = false,
		placingObj = null as THREE.Object3D | null,
		onEscape,
		editorState
	}: {
		scene: THREE.Scene;
		camera: THREE.PerspectiveCamera;
		onReady?: (ctx: RendererContext) => void;
		onUpdate?: () => void;
		backgroundColor?: number;
		orbitTarget?: THREE.Vector3;
		orbitDamping?: boolean;
		orbitDampingFactor?: number;
		orbitMinDistance?: number;
		orbitMaxDistance?: number;
		orbitMaxPolarAngle?: number;
		addLights?: boolean;
		selectionMode?: 'part' | 'face';
		currentTool?: 'select' | 'move' | 'rotate' | 'scale';
		getVisibleParts?: () => { object3D: THREE.Object3D }[];
		filterIsolated?: <T extends { object: THREE.Object3D }>(hits: T[]) => T[];
		placing?: boolean;
		placingObj?: THREE.Object3D | null;
		onEscape?: () => void;
		editorState: EditorState;
	} = $props();

	let container: HTMLDivElement;
	let renderer: THREE.WebGLRenderer;
	let transformControls = $state<TransformControls | null>(null);
	let outlinePass = $state<OutlinePass | null>(null);
	let hoverOutlinePass: OutlinePass;
	let faceHighlight: THREE.LineSegments | null = null;
	let selectedFaceHighlights: THREE.LineSegments[] = [];
	let mousePos = new THREE.Vector2();

	$effect(() => {
		const ids = editorState.selectedIds;
		const current = currentTool;
		const parts = editorState.parts;
		if (!outlinePass || !transformControls) return;

		console.log('Selection update', [...ids], 'Tool:', current, 'Total parts:', parts.length);

		const first = editorState.firstSelectedNode;
		const selection = editorState.selectedParts;
		const objs = selection.map((p) => p.object3D);

		if (
			first &&
			(first.type === 'part' || (first as any).type === 'model') &&
			current !== 'select'
		) {
			console.log('Attaching transform controls to', first.object3D);
			transformControls.attach(first.object3D);
			const modeMap = { move: 'translate', rotate: 'rotate', scale: 'scale' };
			transformControls.setMode((modeMap as any)[current] || 'translate');
		} else {
			transformControls.detach();
		}

		console.log('Outline objects count:', objs.length);
		outlinePass.selectedObjects = objs;
	});

	$effect(() => {
		if (!scene) return;

		const highlights: THREE.LineSegments[] = [];

		for (let i = 0; i < editorState.selectedIds.length; i++) {
			const faceData = editorState.selectedFaces[i];
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

	onMount(() => {
		scene.background = new THREE.Color(backgroundColor);

		renderer = new THREE.WebGLRenderer({ antialias: false });
		renderer.setSize(RES_W, RES_H);
		renderer.setPixelRatio(1);
		renderer.shadowMap.enabled = true;
		renderer.shadowMap.type = THREE.PCFSoftShadowMap;
		renderer.domElement.style.imageRendering = 'pixelated';
		renderer.domElement.style.width = '100%';
		renderer.domElement.style.height = '100%';
		renderer.domElement.style.touchAction = 'none';
		container.appendChild(renderer.domElement);

		const controls = new OrbitControls(camera, renderer.domElement);
		controls.target.copy(orbitTarget);
		controls.enableDamping = orbitDamping;
		controls.dampingFactor = orbitDampingFactor;
		controls.minDistance = orbitMinDistance;
		controls.maxDistance = orbitMaxDistance;
		controls.maxPolarAngle = orbitMaxPolarAngle;
		controls.update();

		if (addLights) {
			const ambientLight = new THREE.AmbientLight(0xffffff, 1.25);
			scene.add(ambientLight);
			const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
			directionalLight.position.set(5, 10, 7.5);
			directionalLight.castShadow = true;
			directionalLight.shadow.mapSize.width = 1024;
			directionalLight.shadow.mapSize.height = 1024;
			directionalLight.shadow.camera.left = -20;
			directionalLight.shadow.camera.right = 20;
			directionalLight.shadow.camera.top = 20;
			directionalLight.shadow.camera.bottom = -20;
			scene.add(directionalLight);
		}

		const tc = new TransformControls(camera, renderer.domElement);
		transformControls = tc;
		scene.add(tc.getHelper());

		let isTransformDragging = false;
		let transformClicked = false;
		tc.addEventListener('mouseDown', () => {
			controls.enabled = false;
			isTransformDragging = true;
			transformClicked = true;
			editorState.pushUndo();
		});
		tc.addEventListener('mouseUp', () => {
			controls.enabled = true;
			isTransformDragging = false;
		});

		const composer = new EffectComposer(renderer);

		const renderPass = new RenderPass(scene, camera);
		renderPass.background = new THREE.Color(backgroundColor);
		composer.addPass(renderPass);

		const retroPass = new ShaderPass(RetroColorShader);
		retroPass.uniforms.colorLevels.value = 12.0;
		composer.addPass(retroPass);

		const selPass = new OutlinePass(new THREE.Vector2(RES_W, RES_H), scene, camera);
		outlinePass = selPass;
		selPass.visibleEdgeColor = new THREE.Color(0x00bbff);
		selPass.edgeStrength = 5.0;
		selPass.edgeThickness = 1.0;
		composer.addPass(selPass);

		hoverOutlinePass = new OutlinePass(new THREE.Vector2(RES_W, RES_H), scene, camera);
		hoverOutlinePass.selectedObjects = [];
		hoverOutlinePass.visibleEdgeColor = new THREE.Color(0xaaaaaa);
		composer.addPass(hoverOutlinePass);

		function onMouseMovePos(event: MouseEvent) {
			mousePos.set(event.clientX, event.clientY);
		}
		renderer.domElement.addEventListener('mousemove', onMouseMovePos);

		const hoverCheckInterval = setInterval(() => {
			if (!renderer || !camera || !scene || placing) return;

			const rect = renderer.domElement.getBoundingClientRect();
			if (rect.width === 0 || rect.height === 0) return;

			const mouse = new THREE.Vector2(
				((mousePos.x - rect.left) / rect.width) * 2 - 1,
				-((mousePos.y - rect.top) / rect.height) * 2 + 1
			);
			const raycaster = new THREE.Raycaster();
			raycaster.setFromCamera(mouse, camera);
			const partsList = getVisibleParts().map((p) => p.object3D);
			let intersects = raycaster.intersectObjects(partsList, true);

			for (let i = intersects.length - 1; i >= 0; i--) {
				if (intersects[i].object === placingObj) {
					intersects.splice(i, 1);
				}
			}

			intersects = filterIsolated(intersects);

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

			if (intersects.length > 0) {
				const hit = intersects[0];
				const mesh = hit.object;
				const geometry = mesh.geometry;
				const positionAttr = geometry.attributes.position;
				const indexAttr = geometry.index;
				const faceNormal = hit.face?.normal;

				let d_hit = 0;
				if (faceNormal && hit.face) {
					const hitA = new THREE.Vector3().fromBufferAttribute(positionAttr, hit.face.a);
					d_hit = faceNormal.dot(hitA);
				}

				const connectedVertexIndices: number[] = [];
				const triangleCount = indexAttr ? indexAttr.count / 3 : positionAttr.count / 3;

				for (let i = 0; i < triangleCount; i++) {
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

		function handlePartClick(event: MouseEvent) {
			if (placing) return;
			if (transformClicked) {
				transformClicked = false;
				return;
			}

			const rect = renderer.domElement.getBoundingClientRect();
			if (rect.width === 0 || rect.height === 0) return;

			console.log('click', mousePos, 'rect', rect);

			const mouse = new THREE.Vector2(
				((event.clientX - rect.left) / rect.width) * 2 - 1,
				-((event.clientY - rect.top) / rect.height) * 2 + 1
			);
			const raycaster = new THREE.Raycaster();
			raycaster.setFromCamera(mouse, camera);
			const partsList = getVisibleParts().map((p) => p.object3D);
			const intersects = raycaster.intersectObjects(partsList, true);
			if (intersects.length === 0) return;

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
					} else {
						editorState.toggleSelect(part.userData.partId);
					}
				} else {
					if (selectionMode === 'face') {
						const faceIndex = intersects[0].faceIndex ?? 0;
						const hitMesh = intersects[0].object as THREE.Mesh;
						editorState.select(part.userData.partId, faceIndex, hitMesh);
					} else {
						console.log('selecting part', part.userData.partId);
						editorState.select(part.userData.partId);

						console.log(editorState.selectedIds);
					}
				}
			}
		}

		function handleKey(event: KeyboardEvent) {
			if (event.key === 'Escape') {
				editorState.deselectAll();
				onEscape?.();
			}

			if (event.key === 'Tab') {
				event.preventDefault();
				selectionMode = selectionMode === 'part' ? 'face' : 'part';
			}

			if (event.key === '1') {
				currentTool = 'select';
				transformControls?.detach();
			} else if (event.key === '2') {
				currentTool = 'move';
				if (editorState.firstSelectedNode?.type === 'part') {
					transformControls?.attach(editorState.firstSelectedNode.object3D);
					transformControls?.setMode('translate');
				}
			} else if (event.key === '3') {
				currentTool = 'rotate';
				if (editorState.firstSelectedNode?.type === 'part') {
					transformControls?.attach(editorState.firstSelectedNode.object3D);
					transformControls?.setMode('rotate');
				}
			} else if (event.key === '4') {
				currentTool = 'scale';
				if (editorState.firstSelectedNode?.type === 'part') {
					transformControls?.attach(editorState.firstSelectedNode.object3D);
					transformControls?.setMode('scale');
				}
			}
		}

		renderer.domElement.addEventListener('mousedown', handlePartClick);
		document.addEventListener('keydown', handleKey);

		function animate() {
			onUpdate?.();
			controls.update();
			composer.render();
		}
		renderer.setAnimationLoop(animate);

		const resizeObserver = new ResizeObserver(() => {
			const rect = container.getBoundingClientRect();
			if (rect.width > 0 && rect.height > 0) {
				camera.aspect = rect.width / rect.height;
				camera.updateProjectionMatrix();
				renderer.setSize(rect.width, rect.height);
				composer.setSize(rect.width, rect.height);
			}
		});
		resizeObserver.observe(container);

		onReady?.({ renderer, composer, controls, container, transformControls: tc });

		return () => {
			clearInterval(hoverCheckInterval);
			renderer.domElement.removeEventListener('mousemove', onMouseMovePos);
			renderer.domElement.removeEventListener('mousedown', handlePartClick);
			document.removeEventListener('keydown', handleKey);
			if (faceHighlight) {
				scene.remove(faceHighlight);
				faceHighlight = null;
			}
			for (const h of selectedFaceHighlights) {
				h.parent?.remove(h);
				h.geometry.dispose();
			}
			selectedFaceHighlights = [];
			renderer.dispose();
			container.removeChild(renderer.domElement);
		};
	});
</script>

<div
	bind:this={container}
	class="flex h-full items-center justify-center overflow-hidden bg-[#87ceeb]"
></div>
