<script lang="ts">
    import { onMount } from "svelte";
    import * as THREE from "three";
    import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
    import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
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
        container: HTMLDivElement;
    }

    let {
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
    let camera: THREE.OrthographicCamera;
    let scene: THREE.Scene;

    onMount(() => {
        scene = new THREE.Scene();

        scene.background = new THREE.Color(backgroundColor);

        camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
        camera.position.set(0, 0, 5);

        renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true });
        renderer.setPixelRatio(1);
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        renderer.domElement.style.imageRendering = "pixelated";
        renderer.domElement.style.width = "100%";
        renderer.domElement.style.height = "100%";
        renderer.domElement.style.touchAction = "none";
        renderer.setClearColor(0x0000ff, 0);
        container.appendChild(renderer.domElement);

        const ambientLight = new THREE.AmbientLight(0xffffff, 2.5);
        scene.add(ambientLight);

        const composer = new EffectComposer(renderer);

        const renderPass = new RenderPass(scene, camera);
        composer.addPass(renderPass);

        const retroPass = new ShaderPass(RetroColorShader);
        retroPass.uniforms.colorLevels.value = 12.0;
        composer.addPass(retroPass);

        const geometry = new THREE.BoxGeometry(1.5, 1.5, 1.5);
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
            const aspect = w / h;
            camera.left = -aspect;
            camera.right = aspect;
            camera.top = 1;
            camera.bottom = -1;
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
        class="block h-36 w-36"
        style="background: linear-gradient(135deg, rgba(20, 50, 80, 0.55) 0%, rgba(20, 50, 80, 0) 100%);"
    ></div>

    <div class="h-full flex-1 rounded-lg border-3 border-muted/40"></div>
</div>
