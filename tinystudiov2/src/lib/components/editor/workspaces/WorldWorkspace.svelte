<script lang="ts">
    import * as THREE from "three";
    import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
    import Renderer from "$lib/components/editor/Renderer.svelte";
    import ModelPreview from "$lib/components/editor/sidebar/ModelPreview.svelte";
    import Vector3Input from "$lib/components/editor/sidebar/Vector3Input.svelte";
    import RotationInput from "$lib/components/editor/sidebar/RotationInput.svelte";

    import * as Resizable from "$lib/components/ui/resizable/index.js";
    import { Switch } from "$lib/components/ui/switch/index.js";
    import * as Tooltip from "$lib/components/ui/tooltip/index.js";
    import * as Kbd from "$lib/components/ui/kbd/index.js";

    import {
        MousePointer2,
        Move3D,
        Rotate3D,
        Scale3D,
        Box,
        Plus,
        Trash2,
        Boxes,
        CornerDownRight,
        SquaresUnite,
    } from "@lucide/svelte";

    import { GameData, WorldData, ModelData } from "$lib/stores/data.svelte";
    import * as ECS from "$lib/stores/ecs.svelte";
    import type { Entity } from "$lib/stores/ecs.svelte";

    // ─── Props from parent ──────────────────────────────────────────────
    let {
        worldData,
        gameData,
    }: {
        worldData: WorldData;
        gameData: GameData;
    } = $props();

    // ─── Three.js scene ─────────────────────────────────────────────────
    let scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e);
    scene.fog = new THREE.Fog(0x1a1a2e, 20, 60);

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.6);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 2.5);
    dirLight.position.set(5, 10, 5);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.set(1024, 1024);
    scene.add(dirLight);

    // Camera
    let camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.set(6, 5, 8);
    camera.lookAt(0, 0, 0);

    // ─── Tool / selection state ─────────────────────────────────────────
    let rendererTransformControls = $state<TransformControls | null>(null);
    let isTransformDragging = $state(false);
    let selectionMode = $state<"part" | "face" | "model">("part");
    let currentTool = $state<"select" | "move" | "rotate" | "scale">("select");
    let selectedPartIds = $state<string[]>([]);
    let selectedFaces = $state<
        { entityId: string; faceIndex: number; mesh: THREE.Mesh }[]
    >([]);

    // ─── ECS ↔ Three.js sync ────────────────────────────────────────────
    // Maps world entity ID → Three.js group (contains all meshes for that model instance)
    const groupByEntityId = new Map<string, THREE.Group>();

    /** Create a Three.js group for a world entity that references a model. */
    function createGroupForEntity(entity: Entity): THREE.Group {
        const modelRefComp = entity.components.find(
            (c) => c.name === "ModelRef",
        );
        const transformComp = entity.components.find(
            (c) => c.name === "Transform",
        );

        if (!modelRefComp || !transformComp) return new THREE.Group();

        const modelId = modelRefComp.data.modelId.value as string;
        const model = gameData.models.find((m) => m.id === modelId);
        if (!model) return new THREE.Group();

        const group = new THREE.Group();

        // For each part entity in the model, create a mesh
        for (const partEntity of model.entities) {
            const meshComp = partEntity.components.find(
                (c) => c.name === "Mesh",
            );
            const partTransform = partEntity.components.find(
                (c) => c.name === "Transform",
            );
            if (!meshComp || !partTransform) continue;

            const geomType = meshComp.data.geometryType.value as string;
            const size = meshComp.data.size.value as {
                x: number;
                y: number;
                z: number;
            };
            const color = meshComp.data.color.value as number;

            let geometry: THREE.BufferGeometry;
            switch (geomType) {
                case "sphere":
                    geometry = new THREE.SphereGeometry(size.x / 2);
                    break;
                case "cylinder":
                    geometry = new THREE.CylinderGeometry(
                        size.x / 2,
                        size.x / 2,
                        size.y,
                    );
                    break;
                default:
                    geometry = new THREE.BoxGeometry(size.x, size.y, size.z);
            }

            const mesh = new THREE.Mesh(
                geometry,
                new THREE.MeshStandardMaterial({ color }),
            );
            mesh.castShadow = true;
            mesh.receiveShadow = true;

            const partPos = partTransform.data.position.value as {
                x: number;
                y: number;
                z: number;
            };
            mesh.position.set(partPos.x, partPos.y, partPos.z);

            const partRot = partTransform.data.rotation.value as {
                x: number;
                y: number;
                z: number;
            };
            mesh.rotation.set(partRot.x, partRot.y, partRot.z);

            const partScale = partTransform.data.scale.value as {
                x: number;
                y: number;
                z: number;
            };
            mesh.scale.set(partScale.x, partScale.y, partScale.z);

            // Tag the mesh with the WORLD entity id so the Renderer can
            // resolve selections back to this world instance (the engine
            // also reads `partId` to recognise parts in-game).
            mesh.userData.partId = entity.id;
            mesh.userData.entityId = entity.id;

            group.add(mesh);
        }

        // Set group position from the world entity's transform
        const pos = transformComp.data.position.value as {
            x: number;
            y: number;
            z: number;
        };
        group.position.set(pos.x, pos.y, pos.z);

        const rot = transformComp.data.rotation.value as {
            x: number;
            y: number;
            z: number;
        };
        group.rotation.set(rot.x, rot.y, rot.z);

        const scl = transformComp.data.scale.value as {
            x: number;
            y: number;
            z: number;
        };
        group.scale.set(scl.x, scl.y, scl.z);

        group.userData.entityId = entity.id;
        scene.add(group);
        groupByEntityId.set(entity.id, group);
        return group;
    }

    /** Update an existing Three.js group from ECS data (skipped while dragging). */
    function syncEntityToGroup(entity: Entity, group: THREE.Group) {
        const transformComp = entity.components.find(
            (c) => c.name === "Transform",
        );
        if (!transformComp) return;

        const pos = transformComp.data.position.value as {
            x: number;
            y: number;
            z: number;
        };
        const rot = transformComp.data.rotation.value as {
            x: number;
            y: number;
            z: number;
        };
        const scl = transformComp.data.scale.value as {
            x: number;
            y: number;
            z: number;
        };

        group.position.set(pos.x, pos.y, pos.z);
        group.rotation.set(rot.x, rot.y, rot.z);
        group.scale.set(scl.x, scl.y, scl.z);
    }

    /** Spawn a model instance into the world. */
    function spawnModel(model: ModelData) {
        const entity = new ECS.Entity();
        entity.id = crypto.randomUUID();
        entity.name = `${model.name} Instance`;
        entity.baseEntity = "custom";

        // Transform component
        const transform = ECS.createTransformComponent();
        const pos = {
            x: +(Math.random() * 4 - 2).toFixed(2),
            y: 0.5,
            z: +(Math.random() * 4 - 2).toFixed(2),
        };
        transform.data.position.value = pos;
        entity.components.push(transform);

        // ModelRef component
        const modelRef = ECS.createModelRefComponent(model.id);
        entity.components.push(modelRef);

        // Physics component
        //const physicsComp = ECS.createPhysicsComponent();
        //entity.components.push(physicsComp);

        // Add to world data
        worldData.entities.push(entity);

        // Create Three.js group
        createGroupForEntity(entity);

        console.log("Spawned model instance:", entity);
    }

    /** Delete a world entity and its Three.js group. */
    function deleteEntity(entityId: string) {
        const idx = worldData.entities.findIndex((e) => e.id === entityId);
        if (idx !== -1) {
            worldData.entities.splice(idx, 1);
        }
        const group = groupByEntityId.get(entityId);
        if (group) {
            scene.remove(group);
            group.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                    child.geometry.dispose();
                    const mat = child.material;
                    if (Array.isArray(mat)) {
                        for (const m of mat) m.dispose();
                    } else if (mat) {
                        mat.dispose();
                    }
                }
            });
            groupByEntityId.delete(entityId);
        }
        selectedPartIds = selectedPartIds.filter((id) => id !== entityId);
        selectedFaces = selectedFaces.filter((f) => f.entityId !== entityId);
    }

    function getSelectedEntity(): Entity | undefined {
        if (selectedPartIds.length === 0) return undefined;
        return worldData.entities.find((e) => e.id === selectedPartIds[0]);
    }

    function getModelRefInfo(entity: Entity): {
        modelRefComp: ECS.Component | undefined;
        modelId: any;
        model: ModelData | undefined;
    } {
        const modelRefComp = entity.components.find(
            (c) => c.name === "ModelRef",
        );
        const modelId = modelRefComp?.data.modelId.value;
        const model = gameData.models.find((m) => m.id === modelId);
        return { modelRefComp, modelId, model };
    }

    function handleKeydown(e: KeyboardEvent) {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") return;

        // Tool shortcuts
        if (e.key === "q") currentTool = "select";
        if (e.key === "w") currentTool = "move";
        if (e.key === "e") currentTool = "rotate";
        if (e.key === "r") currentTool = "scale";

        // Mode toggle
        if (e.key === "Tab") {
            e.preventDefault();
            selectionMode = selectionMode === "part" ? "face" : "part";
        }

        // Deselect
        if (e.key === "Escape") {
            selectedPartIds = [];
            selectedFaces = [];
        }
    }

    // ─── TransformControls → ECS sync ──────────────────────────────────
    $effect(() => {
        const tc = rendererTransformControls;
        if (!tc) return;

        const onObjectChange = () => {
            const selectedObject = tc.object as THREE.Object3D;
            if (!selectedObject) return;
            const entityId = selectedObject.userData.entityId as string;
            const entity = worldData.entities.find((e) => e.id === entityId);
            if (entity) {
                const transformComp = entity.components.find(
                    (c) => c.name === "Transform",
                )!;
                transformComp.data.position.value = {
                    x: +selectedObject.position.x.toFixed(3),
                    y: +selectedObject.position.y.toFixed(3),
                    z: +selectedObject.position.z.toFixed(3),
                };

                const rotation = selectedObject.rotation;
                transformComp.data.rotation.value = {
                    x: +rotation.x.toFixed(3),
                    y: +rotation.y.toFixed(3),
                    z: +rotation.z.toFixed(3),
                };

                const scale = selectedObject.scale;
                transformComp.data.scale.value = {
                    x: +scale.x.toFixed(3),
                    y: +scale.y.toFixed(3),
                    z: +scale.z.toFixed(3),
                };
            }

            // Trigger svelte update for sidebar
            selectedPartIds = [...selectedPartIds];
        };

        tc.addEventListener("objectChange", onObjectChange);
        return () => tc.removeEventListener("objectChange", onObjectChange);
    });

    $effect(() => {
        const tc = rendererTransformControls;
        if (!tc) return;

        const onMouseDown = () => (isTransformDragging = true);
        const onMouseUp = () => (isTransformDragging = false);

        tc.addEventListener("mouseDown", onMouseDown);
        tc.addEventListener("mouseUp", onMouseUp);
        return () => {
            tc.removeEventListener("mouseDown", onMouseDown);
            tc.removeEventListener("mouseUp", onMouseUp);
        };
    });

    // ─── ECS → Three.js sync (sidebar edits update the rendered groups) ───
    $effect(() => {
        const entities = worldData.entities;
        const seenIds = new Set<string>();

        const attachedObject = rendererTransformControls?.object;
        const attachedEntityId =
            isTransformDragging && attachedObject
                ? ((attachedObject as THREE.Object3D).userData
                      .entityId as string)
                : undefined;

        for (const entity of entities) {
            seenIds.add(entity.id);

            let group = groupByEntityId.get(entity.id);
            if (!group) {
                group = createGroupForEntity(entity);
            }

            if (group && entity.id !== attachedEntityId) {
                syncEntityToGroup(entity, group);
            }
        }

        // Remove groups for entities that no longer exist
        for (const [id, group] of groupByEntityId) {
            if (!seenIds.has(id)) {
                scene.remove(group);
                group.traverse((child) => {
                    if (child instanceof THREE.Mesh) {
                        child.geometry.dispose();
                        const mat = child.material;
                        if (Array.isArray(mat)) {
                            for (const m of mat) m.dispose();
                        } else if (mat) {
                            mat.dispose();
                        }
                    }
                });
                groupByEntityId.delete(id);
            }
        }
    });

    function getSelectedPartComponents() {
        let compTypes = new Map<string, number>();

        for (const partId of selectedPartIds) {
            const entity = worldData.entities.find((e) => e.id === partId);
            if (!entity) continue;
            for (const comp of entity.components) {
                compTypes.set(comp.name, (compTypes.get(comp.name) || 0) + 1);
            }
        }

        const components: ECS.Component[] = [];
        const componentData = new Map<string, ECS.Component[]>();
        for (const [compName, count] of compTypes.entries()) {
            if (count === selectedPartIds.length) {
                const entity = worldData.entities.find(
                    (e) => e.id === selectedPartIds[0],
                );
                if (!entity) continue;

                const comp = entity.components.find((c) => c.name === compName);

                if (comp) {
                    components.push(comp);
                    const instances: ECS.Component[] = [];
                    for (const id of selectedPartIds) {
                        const e = worldData.entities.find((x) => x.id === id);
                        const c = e?.components.find(
                            (x) => x.name === compName,
                        );
                        if (c) instances.push(c);
                    }
                    componentData.set(compName, instances);
                }
            }
        }

        return components.map((c) => ({
            component: c,
            data: componentData.get(c.name) ?? [],
        }));
    }
</script>

<svelte:document onkeydown={handleKeydown} />

<Resizable.PaneGroup direction="horizontal" class="min-h-0 flex-1">
    <!-- Left panel: World entities + Model library -->
    <Resizable.Pane defaultSize={20} class="overflow-hidden border-r">
        <div class="flex h-full flex-col">
            <!-- World entities section -->
            <div
                class="flex shrink-0 items-center justify-between border-b border-border/60 px-4 py-3"
            >
                <h2
                    class="text-xs font-bold tracking-widest text-foreground uppercase"
                >
                    World Objects
                </h2>
            </div>

            <div class="min-h-0 flex-1 overflow-auto px-2 py-1">
                {#each worldData.entities as entity (entity.id)}
                    <div
                        class="group mx-1 flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1.5 text-sm duration-100 {selectedPartIds.includes(
                            entity.id,
                        )
                            ? 'bg-green-500/10 text-green-500'
                            : 'text-foreground hover:bg-muted/60'}"
                        onclick={() => (selectedPartIds = [entity.id])}
                    >
                        <Boxes class="h-3.5 w-3.5 shrink-0 text-green-500" />
                        <span class="flex-1 truncate">{entity.name}</span>
                        <button
                            class="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 duration-100 group-hover:opacity-100 hover:bg-destructive/15 hover:text-destructive"
                            onclick={(e) => {
                                e.stopPropagation();
                                deleteEntity(entity.id);
                            }}
                            aria-label="Delete entity"
                        >
                            <Trash2 class="h-3 w-3" />
                        </button>
                    </div>
                {/each}

                {#if worldData.entities.length === 0}
                    <p
                        class="px-3 py-4 text-center text-xs text-muted-foreground"
                    >
                        No objects in world yet. Spawn a model below.
                    </p>
                {/if}
            </div>

            <!-- Model library section -->
            <div class="shrink-0 border-t border-border/60">
                <div class="px-4 py-3">
                    <h2
                        class="text-xs font-bold tracking-widest text-foreground uppercase"
                    >
                        Models
                    </h2>
                </div>

                <div class="max-h-64 overflow-auto px-2 pb-2">
                    {#each gameData.models as model (model.id)}
                        <div
                            class="mb-1 flex items-center gap-2 rounded-md border border-border/40 bg-muted/20 px-3 py-2"
                        >
                            <Box
                                class="h-4 w-4 shrink-0 text-muted-foreground"
                            />
                            <span class="flex-1 truncate text-sm"
                                >{model.name}</span
                            >
                            <span class="text-xs text-muted-foreground"
                                >{model.entities.length} parts</span
                            >
                            <button
                                class="flex items-center gap-1 rounded-md bg-green-600 px-2 py-1 text-xs font-bold text-white duration-150 hover:bg-green-500 active:scale-95"
                                onclick={() => spawnModel(model)}
                            >
                                <Plus class="h-3 w-3" />
                                Spawn
                            </button>
                        </div>
                    {/each}

                    {#if gameData.models.length === 0}
                        <p
                            class="px-3 py-4 text-center text-xs text-muted-foreground"
                        >
                            No models available. Create a model in the Model
                            workspace.
                        </p>
                    {/if}
                </div>
            </div>

            <div
                class="shrink-0 border-t border-border/60 px-3 py-2 text-xs text-muted-foreground"
            >
                {worldData.entities.length} objects · {gameData.models.length} models
            </div>
        </div>
    </Resizable.Pane>

    <Resizable.Handle />

    <!-- Center: 3D viewport -->
    <Resizable.Pane>
        <div
            class="flex h-full w-full flex-col items-center gap-4 bg-background p-6"
        >
            <div
                class="relative aspect-video w-full overflow-hidden rounded-xl border border-border/60 bg-muted/40"
                style="background-image: repeating-linear-gradient(45deg, rgba(255,255,255,0.04) 0 10px, transparent 10px 20px);"
            >
                <Renderer
                    {scene}
                    {camera}
                    bind:transformControls={rendererTransformControls}
                    bind:selectionMode
                    bind:currentTool
                    bind:selectedPartIds
                    bind:selectedFaces
                    addLights={false}
                />
            </div>

            <!-- Toolbar -->
            <div class="flex items-center gap-3">
                <div class="flex items-center gap-1 rounded-lg bg-muted p-1">
                    <Tooltip.Provider>
                        <Tooltip.Root>
                            <Tooltip.Trigger
                                onclick={() => (currentTool = "select")}
                                class="rounded-md px-3 py-3 text-sm font-bold tracking-wide shadow-sm duration-150 {currentTool ===
                                'select'
                                    ? 'bg-background text-green-500'
                                    : 'hover:bg-background/50'}"
                                ><MousePointer2
                                    class="h-4 w-4"
                                /></Tooltip.Trigger
                            >
                            <Tooltip.Content>
                                <p>
                                    Select Tool <Kbd.Root class="ml-1 font-bold"
                                        >Q</Kbd.Root
                                    >
                                </p>
                            </Tooltip.Content>
                        </Tooltip.Root>
                    </Tooltip.Provider>

                    <Tooltip.Provider>
                        <Tooltip.Root>
                            <Tooltip.Trigger
                                onclick={() => (currentTool = "move")}
                                class="rounded-md px-3 py-3 text-sm font-bold tracking-wide shadow-sm duration-150 {currentTool ===
                                'move'
                                    ? 'bg-background text-green-500'
                                    : 'hover:bg-background/50'}"
                                ><Move3D class="h-4 w-4" /></Tooltip.Trigger
                            >
                            <Tooltip.Content>
                                <p>
                                    Move Tool <Kbd.Root class="ml-1 font-bold"
                                        >W</Kbd.Root
                                    >
                                </p>
                            </Tooltip.Content>
                        </Tooltip.Root>
                    </Tooltip.Provider>

                    <Tooltip.Provider>
                        <Tooltip.Root>
                            <Tooltip.Trigger
                                onclick={() => (currentTool = "rotate")}
                                class="rounded-md px-3 py-3 text-sm font-bold tracking-wide shadow-sm duration-150 {currentTool ===
                                'rotate'
                                    ? 'bg-background text-green-500'
                                    : 'hover:bg-background/50'}"
                                ><Rotate3D class="h-4 w-4" /></Tooltip.Trigger
                            >
                            <Tooltip.Content>
                                <p>
                                    Rotate Tool <Kbd.Root class="ml-1 font-bold"
                                        >E</Kbd.Root
                                    >
                                </p>
                            </Tooltip.Content>
                        </Tooltip.Root>
                    </Tooltip.Provider>

                    <Tooltip.Provider>
                        <Tooltip.Root>
                            <Tooltip.Trigger
                                onclick={() => (currentTool = "scale")}
                                class="rounded-md px-3 py-3 text-sm font-bold tracking-wide shadow-sm duration-150 {currentTool ===
                                'scale'
                                    ? 'bg-background text-green-500'
                                    : 'hover:bg-background/50'}"
                                ><Scale3D class="h-4 w-4" /></Tooltip.Trigger
                            >
                            <Tooltip.Content>
                                <p>
                                    Scale Tool <Kbd.Root class="ml-1 font-bold"
                                        >R</Kbd.Root
                                    >
                                </p>
                            </Tooltip.Content>
                        </Tooltip.Root>
                    </Tooltip.Provider>
                </div>

                <div class="flex items-center gap-1 rounded-lg bg-muted p-1">
                    <Tooltip.Provider>
                        <Tooltip.Root>
                            <Tooltip.Trigger
                                onclick={() => {
                                    selectionMode = "part";
                                    selectedFaces = [];
                                }}
                                class="rounded-md px-3 py-3 text-sm font-bold tracking-wide shadow-sm duration-150 {selectionMode ===
                                'part'
                                    ? 'bg-background text-green-500'
                                    : 'hover:bg-background/50'}"
                                ><Box class="h-4 w-4" /></Tooltip.Trigger
                            >
                            <Tooltip.Content>
                                <p>Select Objects</p>
                            </Tooltip.Content>
                        </Tooltip.Root>
                    </Tooltip.Provider>

                    <Tooltip.Provider>
                        <Tooltip.Root>
                            <Tooltip.Trigger
                                onclick={() => (selectionMode = "face")}
                                class="rounded-md px-3 py-3 text-sm font-bold tracking-wide shadow-sm duration-150 {selectionMode ===
                                'face'
                                    ? 'bg-background text-green-500'
                                    : 'hover:bg-background/50'}"
                                ><SquaresUnite
                                    class="h-4 w-4"
                                /></Tooltip.Trigger
                            >
                            <Tooltip.Content>
                                <p>
                                    Select Faces <Kbd.Root
                                        class="ml-1 font-bold">Tab</Kbd.Root
                                    >
                                </p>
                            </Tooltip.Content>
                        </Tooltip.Root>
                    </Tooltip.Provider>

                    <Tooltip.Provider>
                        <Tooltip.Root>
                            <Tooltip.Trigger
                                onclick={() => (selectionMode = "model")}
                                class="rounded-md px-3 py-3 text-sm font-bold tracking-wide shadow-sm duration-150 {selectionMode ===
                                'model'
                                    ? 'bg-background text-green-500'
                                    : 'hover:bg-background/50'}"
                                ><Boxes class="h-4 w-4" /></Tooltip.Trigger
                            >
                            <Tooltip.Content>
                                <p>Select Models</p>
                            </Tooltip.Content>
                        </Tooltip.Root>
                    </Tooltip.Provider>
                </div>
            </div>

            <!-- Console -->
            <div
                class="flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-lg border border-border/60 bg-card font-mono text-xs shadow-sm"
            >
                <div
                    class="flex items-center gap-1 border-b border-border/60 bg-muted/40 px-2"
                >
                    <button
                        class="relative border-r border-border/60 px-4 py-2 text-[10px] tracking-widest text-muted-foreground uppercase hover:bg-muted"
                    >
                        <div
                            class="absolute right-0 bottom-0 left-0 h-px bg-green-500"
                        ></div>
                        console
                    </button>
                    <button
                        class="border-r border-border/60 px-4 py-2 text-[10px] tracking-widest text-muted-foreground uppercase hover:bg-muted"
                    >
                        output
                    </button>
                </div>
                <div
                    class="flex-1 space-y-1.5 overflow-auto p-4 leading-relaxed text-zinc-400"
                >
                    <div class="flex gap-2">
                        <CornerDownRight class="h-3 w-3 text-green-500" />
                        <span class="text-zinc-300">World workspace loaded</span
                        >
                    </div>
                    <div class="flex gap-2">
                        <CornerDownRight class="h-3 w-3 text-green-500" />
                        <span class="text-zinc-300">
                            {worldData.entities.length} entities · {gameData
                                .models.length} models available
                        </span>
                    </div>
                </div>
                <div
                    class="flex items-center gap-2 border-t border-border/60 bg-muted/30 px-4 py-2"
                >
                    <CornerDownRight class="h-3 w-3 text-zinc-500" />
                    <input
                        type="text"
                        placeholder="type a command…"
                        class="flex-1 bg-transparent text-xs text-foreground placeholder-muted-foreground outline-none"
                    />
                </div>
            </div>
        </div>
    </Resizable.Pane>

    <Resizable.Handle />

    <!-- Right panel: Properties -->
    <Resizable.Pane defaultSize={22} class="overflow-hidden border-l">
        <div class="h-full overflow-y-auto p-5">
            <h2 class="text-xl font-bold text-foreground">Properties</h2>
            {#if selectedPartIds.length > 0}
                {@const entity = getSelectedEntity()}
                <p class="mb-4 text-xs text-muted-foreground">
                    Entity · {entity?.baseEntity ?? "World Object"}
                </p>

                {#if selectedPartIds.length > 1}
                    <p
                        class="mb-3 rounded-md bg-muted/60 px-3 py-1.5 text-xs text-green-400"
                    >
                        {selectedPartIds.length} objects selected
                    </p>
                {/if}

                {#each getSelectedPartComponents() as { component, data }}
                    <div class="mt-5 mb-2 flex items-center gap-2">
                        <p
                            class="font-bold tracking-widest text-muted-foreground uppercase"
                        >
                            {component.name}
                        </p>
                        <div class="h-px flex-1 bg-border/60"></div>
                    </div>

                    {#each Object.entries(component.data) as [key, entry]}
                        <div class="flex flex-col gap-3">
                            {#if entry.type === "vector3"}
                                <div>
                                    <p class="mb-1 text-sm">{key}</p>
                                    {#if key === "rotation"}
                                        <RotationInput
                                            components={data}
                                            {key}
                                        />
                                    {:else}
                                        <Vector3Input components={data} {key} />
                                    {/if}
                                </div>
                            {:else if entry.type === "string"}
                                <div>
                                    <p class="mb-1 text-sm">{key}</p>
                                    <input
                                        type="text"
                                        bind:value={entry.value}
                                        class="my-2 w-full rounded-md border-2 border-border/60 bg-background px-3 py-2 text-sm duration-150 outline-none focus:border-green-700"
                                    />
                                </div>
                            {:else if entry.type === "number"}
                                <div>
                                    <p class="mb-1 text-sm">{key}</p>
                                    <input
                                        type="number"
                                        bind:value={entry.value}
                                        class="my-2 w-full rounded-md border-2 border-border/60 bg-background px-3 py-2 text-sm duration-150 outline-none focus:border-green-700"
                                    />
                                </div>
                            {:else if entry.type === "boolean"}
                                <div class="flex items-center justify-between">
                                    <p class="text-sm">{key}</p>
                                    <Switch bind:checked={entry.value} />
                                </div>
                            {:else if entry.type === "color"}
                                <div>
                                    <p class="mb-1 text-sm">{key}</p>
                                    <input
                                        type="color"
                                        bind:value={entry.value}
                                        class="my-2 h-10 w-full rounded-md border-2 border-border/60 bg-background duration-150 outline-none focus:border-green-700"
                                    />
                                </div>
                            {:else}
                                <div>
                                    <p class="mb-1 text-sm">{key}</p>
                                    <input
                                        type="text"
                                        bind:value={entry.value}
                                        class="my-2 w-full rounded-md border-2 border-border/60 bg-background px-3 py-2 text-sm duration-150 outline-none focus:border-green-700"
                                    />
                                </div>
                            {/if}
                        </div>
                    {/each}
                {/each}
            {:else}
                <p class="mb-4 text-xs text-muted-foreground">
                    Select an entity in the world to view its properties.
                </p>

                <!-- World info when nothing selected -->
                <div class="mt-5 mb-2 flex items-center gap-2">
                    <p
                        class="text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
                    >
                        World
                    </p>
                    <div class="h-px flex-1 bg-border/60"></div>
                </div>

                <p class="mt-2 text-sm">World Name</p>
                <input
                    type="text"
                    bind:value={worldData.name}
                    class="my-2 w-full rounded-md border-2 border-border/60 bg-background px-3 py-2 text-sm duration-150 outline-none focus:border-green-700"
                />

                <div
                    class="mt-4 rounded-md border border-border/40 bg-muted/20 p-3"
                >
                    <p class="text-sm text-foreground">
                        {worldData.entities.length} entities
                    </p>
                    <p class="mt-1 text-xs text-muted-foreground">
                        {gameData.models.length} models available
                    </p>
                </div>
            {/if}
        </div>
    </Resizable.Pane>
</Resizable.PaneGroup>
