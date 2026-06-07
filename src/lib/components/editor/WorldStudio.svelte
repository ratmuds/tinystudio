<script lang="ts">
	import { onMount } from 'svelte';
	import * as THREE from 'three';
	import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

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

	type Axis = 'x' | 'y' | 'z';

	let container: HTMLDivElement;

	onMount(() => {
		const scene = new THREE.Scene();
		scene.background = new THREE.Color(COLORS.sky);

		const camera = new THREE.PerspectiveCamera(60, RES_W / RES_H, 0.1, 1000);
		camera.position.set(6, 5, 8);
		camera.lookAt(0, 0, 0);

		const renderer = new THREE.WebGLRenderer({ antialias: false });
		renderer.setSize(RES_W, RES_H);
		renderer.setPixelRatio(1);
		renderer.domElement.style.imageRendering = 'pixelated';
		renderer.domElement.style.width = '100%';
		renderer.domElement.style.height = '100%';
		renderer.domElement.style.touchAction = 'none';
		container.appendChild(renderer.domElement);

		const controls = new OrbitControls(camera, renderer.domElement);
		controls.target.set(0, 1, 0);
		controls.enableDamping = true;
		controls.dampingFactor = 0.05;
		controls.maxPolarAngle = Math.PI / 2.2;
		controls.minDistance = 3;
		controls.maxDistance = 20;
		controls.update();

		// --- Ground ---
		const groundGeo = new THREE.PlaneGeometry(16, 16);
		const groundMat = new THREE.MeshBasicMaterial({ color: COLORS.grass });
		const ground = new THREE.Mesh(groundGeo, groundMat);
		ground.rotation.x = -Math.PI / 2;
		ground.position.y = -0.5;
		scene.add(ground);

		// --- Single movable stud ---
		const stud = new THREE.Group();
		const studMat = new THREE.MeshBasicMaterial({ color: COLORS.stud });
		const studTopMat = new THREE.MeshBasicMaterial({ color: COLORS.studTop });
		const studBody = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.4, 0.9), studMat);
		studBody.position.y = -0.3;
		stud.add(studBody);
		const studTop = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.08, 8), studTopMat);
		studTop.position.y = -0.06;
		stud.add(studTop);
		scene.add(stud);

		// --- Tree ---
		const trunkMat = new THREE.MeshBasicMaterial({ color: COLORS.trunk });
		const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 2, 6), trunkMat);
		trunk.position.set(2, 0.5, 2);
		scene.add(trunk);

		const leafMat = new THREE.MeshBasicMaterial({ color: COLORS.leaves });
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
			scene.add(leaf);
		}

		// --- Sun ---
		const sunMat = new THREE.MeshBasicMaterial({ color: COLORS.sun });
		const sun = new THREE.Mesh(new THREE.CircleGeometry(1.2, 8), sunMat);
		sun.position.set(-8, 6, -10);
		scene.add(sun);

		function animate() {
			controls.update();
			renderer.render(scene, camera);
		}
		renderer.setAnimationLoop(animate);

		return () => {
			renderer.dispose();
			container.removeChild(renderer.domElement);
		};
	});
</script>

<div
	bind:this={container}
	class="flex h-full items-center justify-center overflow-hidden bg-[#87ceeb]"
></div>
