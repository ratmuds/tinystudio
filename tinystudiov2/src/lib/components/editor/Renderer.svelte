<script lang="ts" module>
    /**
     * Given a mesh geometry and a face (triangle) index, returns a new BufferGeometry
     * containing all triangles that are coplanar with the given face.
     * Used for highlighting flat faces that span multiple triangles.
     */
    export function getFaceEdgesGeometry(
        geometry: THREE.BufferGeometry,
        faceIndex: number,
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
        const triCount = indexAttr
            ? indexAttr.count / 3
            : positionAttr.count / 3;

        for (let i = 0; i < triCount; i++) {
            const ai = indexAttr ? indexAttr.getX(i * 3) : i * 3;
            const bi = indexAttr ? indexAttr.getY(i * 3) : i * 3 + 1;
            const ci = indexAttr ? indexAttr.getZ(i * 3) : i * 3 + 2;

            const aPi = new THREE.Vector3().fromBufferAttribute(
                positionAttr,
                ai,
            );
            const bPi = new THREE.Vector3().fromBufferAttribute(
                positionAttr,
                bi,
            );
            const cPi = new THREE.Vector3().fromBufferAttribute(
                positionAttr,
                ci,
            );

            const triNormal = new THREE.Vector3()
                .subVectors(bPi, aPi)
                .cross(new THREE.Vector3().subVectors(cPi, aPi))
                .normalize();

            if (
                faceNormal.angleTo(triNormal) < 0.01 &&
                Math.abs(triNormal.dot(aPi) - d) < 1e-4
            ) {
                connectedIndices.push(ai, bi, ci);
            }
        }

        if (connectedIndices.length < 3) return null;

        const verts: number[] = [];
        for (const vi of connectedIndices) {
            verts.push(
                positionAttr.getX(vi),
                positionAttr.getY(vi),
                positionAttr.getZ(vi),
            );
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute(
            "position",
            new THREE.Float32BufferAttribute(verts, 3),
        );
        return geo;
    }

    /**
     * Given a triangle faceIndex, finds the lowest triangle index in the same coplanar group.
     * This provides a stable canonical identifier so clicking any triangle on the same
     * visual face always maps to the same face selection.
     */
    export function getCanonicalFaceIndex(
        geometry: THREE.BufferGeometry,
        faceIndex: number,
    ): number {
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
        let minIndex = faceIndex;
        const triCount = indexAttr
            ? indexAttr.count / 3
            : positionAttr.count / 3;

        for (let i = 0; i < triCount; i++) {
            const ai = indexAttr ? indexAttr.getX(i * 3) : i * 3;
            const bi = indexAttr ? indexAttr.getY(i * 3) : i * 3 + 1;
            const ci = indexAttr ? indexAttr.getZ(i * 3) : i * 3 + 2;

            const aPi = new THREE.Vector3().fromBufferAttribute(
                positionAttr,
                ai,
            );
            const bPi = new THREE.Vector3().fromBufferAttribute(
                positionAttr,
                bi,
            );
            const cPi = new THREE.Vector3().fromBufferAttribute(
                positionAttr,
                ci,
            );

            const triNormal = new THREE.Vector3()
                .subVectors(bPi, aPi)
                .cross(new THREE.Vector3().subVectors(cPi, aPi))
                .normalize();

            if (
                faceNormal.angleTo(triNormal) < 0.01 &&
                Math.abs(triNormal.dot(aPi) - d) < 1e-4
            ) {
                if (i < minIndex) minIndex = i;
            }
        }

        return minIndex;
    }
</script>

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
        transformControls = $bindable<TransformControls | null>(null),
        selectionMode = $bindable<"part" | "face" | "model">("part"),
        currentTool = $bindable<"select" | "move" | "rotate" | "scale">(
            "select",
        ),
        selectedPartIds = $bindable<string[]>([]),
        selectedFaces = $bindable<
            { entityId: string; faceIndex: number; mesh: THREE.Mesh }[]
        >([]),
        addLights = true,
    }: {
        scene: THREE.Scene;
        camera: THREE.Camera;
        transformControls?: TransformControls | null;
        selectionMode?: "part" | "face" | "model";
        currentTool?: "select" | "move" | "rotate" | "scale";
        selectedPartIds?: string[];
        selectedFaces?: {
            entityId: string;
            faceIndex: number;
            mesh: THREE.Mesh;
        }[];
        addLights?: boolean;
    } = $props();

    let container: HTMLDivElement;
    let renderer: THREE.WebGLRenderer;
    let outlinePass: OutlinePass | null = null;
    let hoverOutlinePass: OutlinePass;
    let faceHighlight: THREE.LineSegments | null = null;
    let selectedFaceHighlights: THREE.LineSegments[] = [];
    let mousePos = new THREE.Vector2();

    // Effect: Update outline pass when selection changes
    $effect(() => {
        if (!outlinePass) {
            console.warn("OutlinePass not initialized yet");
            return;
        }
        const objs = selectedPartIds
            .map((id) => findPartById(id))
            .filter((obj): obj is THREE.Object3D => obj !== null);
        outlinePass.selectedObjects = objs;
    });

    // Effect: Update transform controls when tool or selection changes
    $effect(() => {
        if (!transformControls) return;
        const tool = currentTool;
        const ids = selectedPartIds;

        if (tool !== "select" && ids.length > 0) {
            const obj = findPartById(ids[0]);
            if (obj) {
                transformControls.attach(obj);
                const modeMap = {
                    move: "translate",
                    rotate: "rotate",
                    scale: "scale",
                };
                transformControls.setMode(modeMap[tool] || "translate");
            } else {
                transformControls.detach();
            }
        } else {
            transformControls.detach();
        }
    });

    // Effect: Update face highlights when selectedFaces changes
    $effect(() => {
        const faces = selectedFaces;

        // Remove ALL existing highlights first to avoid duplicates
        for (const h of selectedFaceHighlights) {
            h.parent?.remove(h);
            h.geometry.dispose();
        }

        // Create new highlights
        const newHighlights: THREE.LineSegments[] = [];
        for (const face of faces) {
            if (!face.mesh?.geometry) continue;
            const faceGeo = getFaceEdgesGeometry(
                face.mesh.geometry,
                face.faceIndex,
            );
            if (!faceGeo) continue;
            const edgesGeo = new THREE.EdgesGeometry(faceGeo, 0.2);
            const highlight = new THREE.LineSegments(
                edgesGeo,
                new THREE.LineBasicMaterial({ color: 0x44ff44 }),
            );
            // Add as child of mesh (geometry is in local space)
            face.mesh.add(highlight);
            newHighlights.push(highlight);
        }

        // Update tracking
        selectedFaceHighlights = newHighlights;

        // Cleanup on destroy only
        return () => {
            for (const h of selectedFaceHighlights) {
                h.parent?.remove(h);
                h.geometry.dispose();
            }
        };
    });

    function findPartById(id: string): THREE.Object3D | null {
        for (const child of scene.children) {
            if (
                child.userData.entityId === id ||
                child.userData.partId === id
            ) {
                return child;
            }
        }
        return null;
    }

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
            const directionalLight = new THREE.DirectionalLight(0xffffff, 2.5);
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
        const tcHelper = tc.getHelper();

        // Create a separate scene for transform controls to avoid post-processing
        const tcScene = new THREE.Scene();
        tcScene.add(tcHelper);

        let isTransformDragging = false;
        let transformClicked = false;
        tc.addEventListener("mouseDown", () => {
            controls.enabled = false;
            isTransformDragging = true;
            transformClicked = true;
        });
        tc.addEventListener("mouseUp", () => {
            controls.enabled = true;
            isTransformDragging = false;
        });

        // SETUP COMPOSER AND PASSES
        const composer = new EffectComposer(renderer);

        const renderPass = new RenderPass(scene, camera);
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

        // RESIZE HANDLING
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

        // MOUSE TRACKING
        function onMouseMovePos(event: MouseEvent) {
            mousePos.set(event.clientX, event.clientY);
        }
        renderer.domElement.addEventListener("mousemove", onMouseMovePos);

        // ANIMATION LOOP - hide transform controls during composer render to avoid outline
        const animate = () => {
            requestAnimationFrame(animate);
            composer.render();
            // Render transform controls separately without post-processing
            renderer.autoClear = false;
            renderer.render(tcScene, camera);
            renderer.autoClear = true;
        };
        animate();

        // HOVER INTERVAL: Highlight parts/faces under cursor
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
                (obj) => obj.userData.partId || obj.userData.entityId,
            );
            const intersects = raycaster.intersectObjects(partsList, true);

            // Part hover highlighting
            if (intersects.length > 0) {
                let part = intersects[0].object;
                while (
                    part &&
                    !part.userData.partId &&
                    !part.userData.entityId
                ) {
                    part = part.parent!;
                }
                if (part && (part.userData.partId || part.userData.entityId)) {
                    hoverOutlinePass.selectedObjects = [part];
                } else {
                    hoverOutlinePass.selectedObjects = [];
                }
            } else {
                hoverOutlinePass.selectedObjects = [];
            }

            // Face hover highlighting (only in face mode)
            if (selectionMode === "face" && intersects.length > 0) {
                const hit = intersects[0];
                const mesh = hit.object as THREE.Mesh;
                const geometry = mesh.geometry;
                const positionAttr = geometry.attributes.position;
                const indexAttr = geometry.index;
                const faceNormal = hit.face?.normal;

                if (faceNormal && hit.face) {
                    const hitA = new THREE.Vector3().fromBufferAttribute(
                        positionAttr,
                        hit.face.a,
                    );
                    const d_hit = faceNormal.dot(hitA);

                    const connectedVertexIndices: number[] = [];
                    const triangleCount = indexAttr
                        ? indexAttr.count / 3
                        : positionAttr.count / 3;

                    for (let i = 0; i < triangleCount; i++) {
                        const a = indexAttr ? indexAttr.getX(i * 3) : i * 3;
                        const b = indexAttr ? indexAttr.getY(i * 3) : i * 3 + 1;
                        const c = indexAttr ? indexAttr.getZ(i * 3) : i * 3 + 2;

                        const aPos = new THREE.Vector3().fromBufferAttribute(
                            positionAttr,
                            a,
                        );
                        const bPos = new THREE.Vector3().fromBufferAttribute(
                            positionAttr,
                            b,
                        );
                        const cPos = new THREE.Vector3().fromBufferAttribute(
                            positionAttr,
                            c,
                        );

                        const triNormal = new THREE.Vector3()
                            .subVectors(bPos, aPos)
                            .cross(new THREE.Vector3().subVectors(cPos, aPos))
                            .normalize();

                        if (
                            triNormal.angleTo(faceNormal) < 0.01 &&
                            Math.abs(triNormal.dot(aPos) - d_hit) < 1e-4
                        ) {
                            connectedVertexIndices.push(a, b, c);
                        }
                    }

                    if (connectedVertexIndices.length >= 3) {
                        const faceVerts: number[] = [];
                        for (const vi of connectedVertexIndices) {
                            faceVerts.push(
                                positionAttr.getX(vi),
                                positionAttr.getY(vi),
                                positionAttr.getZ(vi),
                            );
                        }
                        const faceGeo = new THREE.BufferGeometry();
                        faceGeo.setAttribute(
                            "position",
                            new THREE.Float32BufferAttribute(faceVerts, 3),
                        );
                        const edgesGeo = new THREE.EdgesGeometry(faceGeo, 0.1);
                        if (faceHighlight) scene.remove(faceHighlight);
                        faceHighlight = new THREE.LineSegments(
                            edgesGeo,
                            new THREE.LineBasicMaterial({ color: 0xffff00 }),
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
            } else if (faceHighlight) {
                scene.remove(faceHighlight);
                faceHighlight = null;
            }
        }, 100);

        // CLICK HANDLER: Selection logic
        function handlePartClick(event: MouseEvent) {
            if (transformClicked) {
                transformClicked = false;
                return;
            }
            if (!renderer || !camera || !scene) return;

            const rect = renderer.domElement.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) return;

            const mouse = new THREE.Vector2(
                ((event.clientX - rect.left) / rect.width) * 2 - 1,
                -((event.clientY - rect.top) / rect.height) * 2 + 1,
            );
            const raycaster = new THREE.Raycaster();
            raycaster.setFromCamera(mouse, camera);
            const partsList = scene.children.filter(
                (obj) => obj.userData.partId || obj.userData.entityId,
            );
            const intersects = raycaster.intersectObjects(partsList, true);

            if (intersects.length === 0) {
                // Clicked empty space - deselect all
                selectedPartIds = [];
                selectedFaces = [];
                return;
            }

            let part = intersects[0].object;
            while (part && !part.userData.partId && !part.userData.entityId) {
                part = part.parent!;
            }

            if (part && (part.userData.partId || part.userData.entityId)) {
                const partId = (part.userData.entityId ||
                    part.userData.partId) as string;

                if (selectionMode === "face") {
                    // Face selection
                    const hitFaceIndex = intersects[0].faceIndex ?? 0;
                    const hitMesh = intersects[0].object as THREE.Mesh;

                    // Normalize to canonical face index (first triangle in coplanar group)
                    // This ensures clicking any triangle on the same visual face selects the same face
                    const canonicalFaceIndex = getCanonicalFaceIndex(
                        hitMesh.geometry,
                        hitFaceIndex,
                    );

                    if (event.shiftKey) {
                        // Toggle face selection
                        const existingIndex = selectedFaces.findIndex(
                            (f) =>
                                f.entityId === partId &&
                                f.faceIndex === canonicalFaceIndex,
                        );
                        if (existingIndex >= 0) {
                            selectedFaces = selectedFaces.filter(
                                (_, i) => i !== existingIndex,
                            );
                        } else {
                            selectedFaces = [
                                ...selectedFaces,
                                {
                                    entityId: partId,
                                    faceIndex: canonicalFaceIndex,
                                    mesh: hitMesh,
                                },
                            ];
                        }
                        // Update selectedPartIds to include all parts with selected faces
                        const partIdsWithFaces = [
                            ...new Set(selectedFaces.map((f) => f.entityId)),
                        ];
                        selectedPartIds = partIdsWithFaces;
                    } else {
                        // Single face selection
                        selectedFaces = [
                            {
                                entityId: partId,
                                faceIndex: canonicalFaceIndex,
                                mesh: hitMesh,
                            },
                        ];
                        // Also select the part
                        if (!selectedPartIds.includes(partId)) {
                            selectedPartIds = [partId];
                        }
                    }
                } else {
                    // Part selection
                    if (event.shiftKey) {
                        // Toggle part selection
                        if (selectedPartIds.includes(partId)) {
                            selectedPartIds = selectedPartIds.filter(
                                (id) => id !== partId,
                            );
                        } else {
                            selectedPartIds = [...selectedPartIds, partId];
                        }
                    } else {
                        // Single part selection
                        selectedPartIds = [partId];
                    }
                    // Clear face selection when selecting parts
                    selectedFaces = [];
                }
            }

            // Effect already handles outline updates reactively, no need to duplicate here
            if (!outlinePass) {
                console.warn("OutlinePass not initialized yet");
                return;
            }
            const objs = selectedPartIds
                .map((id) => findPartById(id))
                .filter((obj): obj is THREE.Object3D => obj !== null);
            outlinePass.selectedObjects = objs;
        }

        renderer.domElement.addEventListener("mousedown", handlePartClick);

        return () => {
            ro.disconnect();
            clearInterval(hoverCheckInterval);
            renderer.domElement.removeEventListener(
                "mousemove",
                onMouseMovePos,
            );
            renderer.domElement.removeEventListener(
                "mousedown",
                handlePartClick,
            );
            if (faceHighlight) {
                scene.remove(faceHighlight);
                faceHighlight = null;
            }
            for (const h of selectedFaceHighlights) {
                h.parent?.remove(h);
                h.geometry.dispose();
            }
            selectedFaceHighlights = [];
        };
    });
</script>

<div
    bind:this={container}
    class="flex h-full items-center justify-center overflow-hidden rounded-none"
></div>
