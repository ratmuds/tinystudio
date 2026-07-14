<script lang="ts">
    import { onMount } from "svelte";
    import * as THREE from "three";
    import { OrbitControls } from "three/addons/controls/OrbitControls.js";
    import { TransformControls } from "three/addons/controls/TransformControls.js";
    import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
    import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
    import { OutlinePass } from "three/addons/postprocessing/OutlinePass.js";
    import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";

    const RES_W = 320;
    const RES_H = 240;
    let renderW = $state(RES_W);
    let renderH = $state(RES_H);

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

    let {
        scene,
        camera,
        selectionMode = $bindable<"part" | "face" | "model">("part"),
        currentTool = $bindable<"select" | "move" | "rotate" | "scale">(
            "select",
        ),
        addLights = true,
    }: {
        scene: THREE.Scene;
        camera: THREE.Camera;
        selectionMode: "part" | "face" | "model";
        currentTool: "select" | "move" | "rotate" | "scale";
        addLights: boolean;
    } = $props();

    let container: HTMLDivElement;
    let renderer: THREE.WebGLRenderer;
    let transformControls = $state<TransformControls | null>(null);
    let outlinePass = $state<OutlinePass | null>(null);
    let hoverOutlinePass: OutlinePass;
    let faceHighlight: THREE.LineSegments | null = null;
    let selectedFaceHighlights: THREE.LineSegments[] = [];
    let mousePos = new THREE.Vector2();

    onMount(() => {
        // SETUP RENDERER

        renderer = new THREE.WebGLRenderer({ antialias: false });
        renderer.setSize(renderW, renderH);
        renderer.setPixelRatio(1);
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        renderer.domElement.style.imageRendering = "pixelated";
        renderer.domElement.style.width = "100%";
        renderer.domElement.style.height = "100%";
        renderer.domElement.style.touchAction = "none";
        container.appendChild(renderer.domElement);

        // SETUP CONTROLS AND LIGHTING

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.target.copy(new THREE.Vector3(0, 0, 0));
        controls.enableDamping = true;
        controls.dampingFactor = 0.05;
        controls.minDistance = 0.1;
        controls.maxDistance = 1000;
        controls.maxPolarAngle = Math.PI / 2;
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
        tc.addEventListener("mouseDown", () => {
            controls.enabled = false;
            isTransformDragging = true;
            transformClicked = true;
            editorState.pushUndo();
        });
        tc.addEventListener("mouseUp", () => {
            controls.enabled = true;
            isTransformDragging = false;
        });

        const composer = new EffectComposer(renderer);

        const renderPass = new RenderPass(scene, camera);
        renderPass.background = new THREE.Color(0x202020);
        composer.addPass(renderPass);

        const retroPass = new ShaderPass(RetroColorShader);
        retroPass.uniforms.colorLevels.value = 12.0;
        composer.addPass(retroPass);

        const selPass = new OutlinePass(
            new THREE.Vector2(RES_W, RES_H),
            scene,
            camera,
        );
        outlinePass = selPass;
        selPass.visibleEdgeColor = new THREE.Color(0x00bbff);
        selPass.edgeStrength = 5.0;
        selPass.edgeThickness = 1.0;
        composer.addPass(selPass);

        hoverOutlinePass = new OutlinePass(
            new THREE.Vector2(RES_W, RES_H),
            scene,
            camera,
        );
        hoverOutlinePass.selectedObjects = [];
        hoverOutlinePass.visibleEdgeColor = new THREE.Color(0xaaaaaa);
        composer.addPass(hoverOutlinePass);

        const resize = () => {
            const w = Math.max(1, container.clientWidth);
            const h = Math.max(1, container.clientHeight);
            renderW = w;
            renderH = h;
            renderer.setSize(w, h, false);
            if (camera instanceof THREE.PerspectiveCamera) {
                camera.aspect = w / h;
                camera.updateProjectionMatrix();
            }
            composer.setSize(w, h);
            selPass.setSize(w, h);
            hoverOutlinePass.setSize(w, h);
        };

        const ro = new ResizeObserver(resize);
        ro.observe(container);
        resize();

        function onMouseMovePos(event: MouseEvent) {
            mousePos.set(event.clientX, event.clientY);
        }
        renderer.domElement.addEventListener("mousemove", onMouseMovePos);

        const animate = () => {
            requestAnimationFrame(animate);
            composer.render();
        };
        animate();

        const hoverCheckInterval = setInterval(() => {
            if (!renderer || !camera || !scene) return;

            const rect = renderer.domElement.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) return;

            const mouse = new THREE.Vector2(
                ((mousePos.x - rect.left) / rect.width) * 2 - 1,
                -((mousePos.y - rect.top) / rect.height) * 2 + 1,
            );
            const raycaster = new THREE.Raycaster();
            raycaster.setFromCamera(mouse, camera);
            const partsList = scene.children.filter(
                (obj) => obj.userData.partId,
            );
            let intersects = raycaster.intersectObjects(partsList, true);

            /*for (let i = intersects.length - 1; i >= 0; i--) {
                if (intersects[i].object === placingObj) {
                    intersects.splice(i, 1);
                }
            }*/

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
        }, 100);

        return () => {
            ro.disconnect();
            clearInterval(hoverCheckInterval);
            renderer.domElement.removeEventListener("mousemove", onMouseMovePos);
        };
    });
</script>

<div
    bind:this={container}
    class="flex h-full items-center justify-center overflow-hidden rounded-none"
></div>
