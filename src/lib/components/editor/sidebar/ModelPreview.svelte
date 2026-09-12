<script lang="ts">
    import { onMount } from "svelte";
    import * as THREE from "three";
    import { OrbitControls } from "three/addons/controls/OrbitControls.js";
    import { TransformControls } from "three/addons/controls/TransformControls.js";
    import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
    import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
    import { OutlinePass } from "three/addons/postprocessing/OutlinePass.js";
    import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";

    const PIXEL_SCALE = 4;

    const RetroColorShader = {
        uniforms: {
            tDiffuse: { value: null },
            colorLevels: { value: 8.0 },
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
        selectionMode = $bindable<"part" | "face">("part"),
        currentTool = $bindable<"select" | "move" | "rotate" | "scale">(
            "select",
        ),
        getVisibleParts = () => [] as { object3D: THREE.Object3D }[],
        filterIsolated = <T extends { object: THREE.Object3D }>(hits: T[]) =>
            hits,
        placing = false,
        placingObj = null as THREE.Object3D | null,
        onEscape,
        editorState = null,
        physics = false,
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
        selectionMode?: "part" | "face";
        currentTool?: "select" | "move" | "rotate" | "scale";
        getVisibleParts?: () => { object3D: THREE.Object3D }[];
        filterIsolated?: <T extends { object: THREE.Object3D }>(
            hits: T[],
        ) => T[];
        placing?: boolean;
        placingObj?: THREE.Object3D | null;
        onEscape?: () => void;
        editorState?: unknown;
        physics?: boolean;
    } = $props();

    let container: HTMLDivElement;
    let renderer: THREE.WebGLRenderer;

    onMount(() => {
        scene.background = new THREE.Color(backgroundColor);

        renderer = new THREE.WebGLRenderer({ antialias: false });
        renderer.setClearColor(backgroundColor);
        renderer.setPixelRatio(1);
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        renderer.domElement.style.imageRendering = "pixelated";
        renderer.domElement.style.width = "100%";
        renderer.domElement.style.height = "100%";
        renderer.domElement.style.touchAction = "none";
        container.appendChild(renderer.domElement);

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.target.copy(orbitTarget);
        controls.enableDamping = orbitDamping;
        controls.dampingFactor = orbitDampingFactor;
        controls.minDistance = orbitMinDistance;
        controls.maxDistance = orbitMaxDistance;
        controls.maxPolarAngle = orbitMaxPolarAngle;
        controls.update();

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

        const composer = new EffectComposer(renderer);

        const renderPass = new RenderPass(scene, camera);
        composer.addPass(renderPass);

        const retroPass = new ShaderPass(RetroColorShader);
        retroPass.uniforms.colorLevels.value = 12.0;
        composer.addPass(retroPass);

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

        function updateSize() {
            if (!container) return;
            const w = container.clientWidth;
            const h = container.clientHeight;
            if (w === 0 || h === 0) return;
            camera.aspect = w / h;
            camera.updateProjectionMatrix();
            const rw = Math.max(1, Math.floor(w / PIXEL_SCALE));
            const rh = Math.max(1, Math.floor(h / PIXEL_SCALE));
            renderer.setSize(rw, rh, false);
            composer.setSize(rw, rh);
        }
        updateSize();

        const resizeObserver = new ResizeObserver(updateSize);
        resizeObserver.observe(container);

        function animate() {
            onUpdate?.();
            controls.update();
            composer.render();
        }
        renderer.setAnimationLoop(animate);

        return () => {
            resizeObserver.disconnect();
            renderer.dispose();
            if (container && renderer.domElement.parentNode === container) {
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
