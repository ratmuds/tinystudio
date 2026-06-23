<script lang="ts">
    import { onMount } from "svelte";
    import * as THREE from "three";
    import { OrbitControls } from "three/addons/controls/OrbitControls.js";
    import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
    import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
    import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";

    export interface RendererContext {
        renderer: THREE.WebGLRenderer;
        container: HTMLDivElement;
    }

    const RetroColorShader = {
        uniforms: {
            tDiffuse: { value: null },
            colorLevels: { value: 16.0 },
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
		`,
    };

    let {
        scene,
        camera,
        onReady,
    }: {
        scene: THREE.Scene;
        camera: THREE.PerspectiveCamera;
        onReady?: (ctx: RendererContext) => void;
    } = $props();

    let container: HTMLDivElement;
    let renderer: THREE.WebGLRenderer;

    onMount(() => {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setSize(container.clientWidth, container.clientHeight);
        renderer.setClearColor(0x000000, 0);
        container.appendChild(renderer.domElement);

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.08;
        controls.minDistance = 2;
        controls.maxDistance = 10;
        controls.enablePan = false;
        controls.update();

        const geometry = new THREE.BoxGeometry(1, 1, 1);
        const material = new THREE.MeshStandardMaterial({
            color: 0x6ad8ff,
            metalness: 0.4,
            roughness: 0.25,
            emissive: 0x0a1a2a,
            emissiveIntensity: 0.4,
        });
        const cube = new THREE.Mesh(geometry, material);
        scene.add(cube);

        const edges = new THREE.LineSegments(
            new THREE.EdgesGeometry(geometry),
            new THREE.LineBasicMaterial({
                color: 0xffffff,
                transparent: true,
                opacity: 0.9,
            }),
        );
        cube.add(edges);

        const ambient = new THREE.AmbientLight(0xffffff, 0.6);
        scene.add(ambient);

        const key = new THREE.DirectionalLight(0xffffff, 1.2);
        key.position.set(3, 4, 5);
        scene.add(key);

        const rim = new THREE.DirectionalLight(0x88aaff, 0.8);
        rim.position.set(-4, -2, -3);
        scene.add(rim);

        const composer = new EffectComposer(renderer);
        composer.addPass(new RenderPass(scene, camera));
        composer.addPass(new ShaderPass(RetroColorShader));

        const resizeObserver = new ResizeObserver(() => {
            if (!container) return;
            const w = container.clientWidth;
            const h = container.clientHeight;
            if (w === 0 || h === 0) return;
            camera.aspect = w / h;
            camera.updateProjectionMatrix();
            renderer.setSize(w, h);
            composer.setSize(w, h);
        });
        resizeObserver.observe(container);

        const animate = () => {
            controls.update();
            composer.render();
        };
        renderer.setAnimationLoop(animate);

        onReady?.({ renderer, container });

        return () => {
            resizeObserver.disconnect();
            renderer.setAnimationLoop(null);
            geometry.dispose();
            material.dispose();
            (edges.material as THREE.Material).dispose();
            edges.geometry.dispose();
            scene.remove(cube, ambient, key, rim);
            renderer.dispose();
            if (renderer.domElement.parentNode === container) {
                container.removeChild(renderer.domElement);
            }
        };
    });
</script>

<div class="my-2 flex h-36 gap-2">
    <div
        bind:this={container}
        class="block h-full w-64 rounded-lg"
        style="background: linear-gradient(135deg, rgba(20, 50, 80, 0.55) 0%, rgba(20, 50, 80, 0) 100%);"
    ></div>

    <div class="h-full flex-1 rounded-lg border-3 border-muted/40"></div>
</div>
