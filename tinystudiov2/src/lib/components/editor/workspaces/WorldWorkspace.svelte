<script lang="ts">
    import * as THREE from "three";
    import Renderer from "$lib/components/editor/Renderer.svelte";
    import ModelPreview from "$lib/components/editor/sidebar/ModelPreview.svelte";
    import Vector3Input from "$lib/components/editor/sidebar/Vector3Input.svelte";
    import RotationInput from "$lib/components/editor/sidebar/RotationInput.svelte";
    import RotaryInput from "$lib/components/editor/sidebar/RotaryInput.svelte";

    import * as Resizable from "$lib/components/ui/resizable/index.js";
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

    import { GameData, WorldData, ModelData } from "$lib/stores/data";
    import * as ECS from "$lib/stores/ecs";
    import type { Entity } from "$lib/stores/ecs";

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

    // ─── ECS ↔ Three.js sync ────────────────────────────────────────────
    // Maps world entity ID → Three.js group (contains all meshes for that model instance)
    const groupByEntityId = new Map<string, THREE.Group>();

    /** Create a Three.js group for a world entity that references a model. */
    function createGroupForEntity(entity: Entity): THREE.Group {
        const modelRefComp = entity.components.find((c) => c.name === "ModelRef");
        const transformComp = entity.components.find((c) => c.name === "Transform");

        if (!modelRefComp || !transformComp) return new THREE.Group();

        const modelId = modelRefComp.data.modelId.value as string;
        const model = gameData.models.find((m) => m.id === modelId);
        if (!model) return new THREE.Group();

        const group = new THREE.Group();

        // For each part entity in the model, create a mesh
        for (const partEntity of model.entities) {
            const meshComp = partEntity.components.find((c) => c.name === "Mesh");
            const partTransform = partEntity.components.find((c) => c.name === "Transform");
            if (!meshComp || !partTransform) continue;

            const geomType = meshComp.data.geometryType.value as string;
            const size = meshComp.data.size.value as { x: number; y: number; z: number };
            const color = meshComp.data.color.value as number;

            let geometry: THREE.BufferGeometry;
            switch (geomType) {
                case "sphere":
                    geometry = new THREE.SphereGeometry(size.x / 2);
                    break;
                case "cylinder":
                    geometry = new THREE.CylinderGeometry(size.x / 2, size.x / 2, size.y);
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

            const partPos = partTransform.data.position.value as { x: number; y: number; z: number };
            mesh.position.set(partPos.x, partPos.y, partPos.z);
            mesh.userData.partId = entity.id;

            group.add(mesh);
        }

        // Set group position from the world entity's transform
        const pos = transformComp.data.position.value as { x: number; y: number; z: number };
        group.position.set(pos.x, pos.y, pos.z);

        group.userData.entityId = entity.id;
        scene.add(group);
        groupByEntityId.set(entity.id, group);
        return group;
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
            groupByEntityId.delete(entityId);
        }
        if (selectedEntityId === entityId) {
            selectedEntityId = null;
        }
    }

    // ─── Selection ──────────────────────────────────────────────────────
    let selectedEntityId = $state<string | null>(null);

    function getSelectedEntity(): Entity | undefined {
        if (!selectedEntityId) return undefined;
        return worldData.entities.find((e) => e.id === selectedEntityId);
    }

    function getEntityTransform(entity: Entity): { position: { x: number; y: number; z: number }; scale: { x: number; y: number; z: number } } {
        const transformComp = entity.components.find((c) => c.name === "Transform");
        if (!transformComp) {
            return {
                position: { x: 0, y: 0, z: 0 },
                scale: { x: 1, y: 1, z: 1 },
            };
        }
        return {
            position: transformComp.data.position.value,
            scale: transformComp.data.scale.value,
        };
    }

    function getModelRefInfo(entity: Entity): { modelRefComp: ECS.Component | undefined; modelId: any; model: ModelData | undefined } {
        const modelRefComp = entity.components.find((c) => c.name === "ModelRef");
        const modelId = modelRefComp?.data.modelId.value;
        const model = gameData.models.find((m) => m.id === modelId);
        return { modelRefComp, modelId, model };
    }

    // ─── Sync existing entities on mount ────────────────────────────────
    $effect(() => {
        if (worldData && worldData.entities.length > 0) {
            for (const entity of worldData.entities) {
                if (!groupByEntityId.has(entity.id)) {
                    createGroupForEntity(entity);
                }
            }
        }
    });
</script>

<Resizable.PaneGroup direction="horizontal" class="min-h-0 flex-1">
    <!-- Left panel: World entities + Model library -->
    <Resizable.Pane defaultSize={20} class="overflow-hidden border-r">
        <div class="flex h-full flex-col">
            <!-- World entities section -->
            <div class="flex shrink-0 items-center justify-between border-b border-border/60 px-4 py-3">
                <h2 class="text-xs font-bold tracking-widest text-foreground uppercase">
                    World Objects
                </h2>
            </div>

            <div class="min-h-0 flex-1 overflow-auto px-2 py-1">
                {#each worldData.entities as entity (entity.id)}
                    <div
                        class="group mx-1 flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1.5 text-sm duration-100 {selectedEntityId === entity.id
                            ? 'bg-green-500/10 text-green-500'
                            : 'text-foreground hover:bg-muted/60'}"
                        onclick={() => (selectedEntityId = entity.id)}
                    >
                        <Boxes class="h-3.5 w-3.5 shrink-0 text-green-500" />
                        <span class="flex-1 truncate">{entity.name}</span>
                        <button
                            class="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 duration-100 hover:bg-destructive/15 hover:text-destructive group-hover:opacity-100"
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
                    <p class="px-3 py-4 text-center text-xs text-muted-foreground">
                        No objects in world yet. Spawn a model below.
                    </p>
                {/if}
            </div>

            <!-- Model library section -->
            <div class="shrink-0 border-t border-border/60">
                <div class="px-4 py-3">
                    <h2 class="text-xs font-bold tracking-widest text-foreground uppercase">
                        Models
                    </h2>
                </div>

                <div class="max-h-64 overflow-auto px-2 pb-2">
                    {#each gameData.models as model (model.id)}
                        <div
                            class="mb-1 flex items-center gap-2 rounded-md border border-border/40 bg-muted/20 px-3 py-2"
                        >
                            <Box class="h-4 w-4 shrink-0 text-muted-foreground" />
                            <span class="flex-1 truncate text-sm">{model.name}</span>
                            <span class="text-xs text-muted-foreground">{model.entities.length} parts</span>
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
                        <p class="px-3 py-4 text-center text-xs text-muted-foreground">
                            No models available. Create a model in the Model workspace.
                        </p>
                    {/if}
                </div>
            </div>

            <div class="shrink-0 border-t border-border/60 px-3 py-2 text-xs text-muted-foreground">
                {worldData.entities.length} objects · {gameData.models.length} models
            </div>
        </div>
    </Resizable.Pane>

    <Resizable.Handle />

    <!-- Center: 3D viewport -->
    <Resizable.Pane>
        <div class="flex h-full w-full flex-col items-center gap-4 bg-background p-6">
            <div
                class="relative aspect-video w-full overflow-hidden rounded-xl border border-border/60 bg-muted/40"
                style="background-image: repeating-linear-gradient(45deg, rgba(255,255,255,0.04) 0 10px, transparent 10px 20px);"
            >
                <Renderer {scene} {camera} />
            </div>

            <!-- Toolbar -->
             <div class="flex items-center gap-3">
                <div class="flex items-center gap-1 rounded-lg bg-muted p-1">
                    <Tooltip.Provider>
                        <Tooltip.Root>
                            <Tooltip.Trigger
                                class="rounded-md bg-background px-3 py-3 text-sm font-bold tracking-wide text-green-500 shadow-sm duration-150"
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
                                class="rounded-md px-3 py-3 text-sm font-bold tracking-wide shadow-sm duration-150 hover:bg-background/50"
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
                                class="rounded-md px-3 py-3 text-sm font-bold tracking-wide shadow-sm duration-150 hover:bg-background/50"
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
                                class="rounded-md px-3 py-3 text-sm font-bold tracking-wide shadow-sm duration-150 hover:bg-background/50"
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
                                class="rounded-md bg-background px-3 py-3 text-sm font-bold tracking-wide text-green-500 shadow-sm duration-150"
                                ><Box class="h-4 w-4" /></Tooltip.Trigger
                            >
                            <Tooltip.Content>
                                <p>Select Object</p>
                            </Tooltip.Content>
                        </Tooltip.Root>
                    </Tooltip.Provider>

                    <Tooltip.Provider>
                        <Tooltip.Root>
                            <Tooltip.Trigger
                                class="rounded-md px-3 py-3 text-sm font-bold tracking-wide shadow-sm duration-150 hover:bg-background/50"
                                ><SquaresUnite
                                    class="h-4 w-4"
                                /></Tooltip.Trigger
                            >
                            <Tooltip.Content>
                                <p>Select Face</p>
                            </Tooltip.Content>
                        </Tooltip.Root>
                    </Tooltip.Provider>

                    <Tooltip.Provider>
                        <Tooltip.Root>
                            <Tooltip.Trigger
                                class="rounded-md px-3 py-3 text-sm font-bold tracking-wide shadow-sm duration-150 hover:bg-background/50"
                                ><Boxes class="h-4 w-4" /></Tooltip.Trigger
                            >
                            <Tooltip.Content>
                                <p>Select Model</p>
                            </Tooltip.Content>
                        </Tooltip.Root>
                    </Tooltip.Provider>
                </div>
            </div>

            <!-- Console -->
            <div
                class="flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-lg border border-border/60 bg-card font-mono text-xs shadow-sm"
            >
                <div class="flex items-center gap-1 border-b border-border/60 bg-muted/40 px-2">
                    <button class="relative border-r border-border/60 px-4 py-2 text-[10px] tracking-widest text-muted-foreground uppercase hover:bg-muted">
                        <div class="absolute right-0 bottom-0 left-0 h-px bg-green-500"></div>
                        console
                    </button>
                    <button class="border-r border-border/60 px-4 py-2 text-[10px] tracking-widest text-muted-foreground uppercase hover:bg-muted">
                        output
                    </button>
                </div>
                <div class="flex-1 space-y-1.5 overflow-auto p-4 leading-relaxed text-zinc-400">
                    <div class="flex gap-2">
                        <CornerDownRight class="h-3 w-3 text-green-500" />
                        <span class="text-zinc-300">World workspace loaded</span>
                    </div>
                    <div class="flex gap-2">
                        <CornerDownRight class="h-3 w-3 text-green-500" />
                        <span class="text-zinc-300">
                            {worldData.entities.length} entities · {gameData.models.length} models available
                        </span>
                    </div>
                </div>
                <div class="flex items-center gap-2 border-t border-border/60 bg-muted/30 px-4 py-2">
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
            {#if selectedEntityId}
                {@const entity = getSelectedEntity()}
                {#if entity}
                    <h2 class="text-xl font-bold text-foreground">Properties</h2>
                    <p class="mb-4 text-xs text-muted-foreground">Entity · {entity.baseEntity}</p>

                    <!-- Transform section -->
                    <div class="mt-5 mb-2 flex items-center gap-2">
                        <p class="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
                            Transform
                        </p>
                        <div class="h-px flex-1 bg-border/60"></div>
                    </div>

                    <p class="mt-2 text-sm">Name</p>
                    <input
                        type="text"
                        bind:value={entity.name}
                        class="my-2 w-full rounded-md border-2 border-border/60 bg-background px-3 py-2 text-sm duration-150 outline-none focus:border-green-700"
                    />

                    <p class="mt-2 text-sm">Position</p>
                    {@const transformData = getEntityTransform(entity)}
                    <Vector3Input />

                    <p class="mt-2 text-sm">Rotation</p>
                    <RotationInput />

                    <p class="mt-2 text-sm">Scale</p>
                    <Vector3Input />

                    <!-- Model reference info -->
                    <div class="mt-5 mb-2 flex items-center gap-2">
                        <p class="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
                            Model Reference
                        </p>
                        <div class="h-px flex-1 bg-border/60"></div>
                    </div>

                    {@const modelInfo = getModelRefInfo(entity)}
                    <div class="rounded-md border border-border/40 bg-muted/20 p-3">
                        {#if modelInfo.model}
                            <p class="text-sm font-medium text-foreground">{modelInfo.model.name}</p>
                            <p class="mt-1 text-xs text-muted-foreground">
                                {modelInfo.model.entities.length} parts · ID: {modelInfo.model.id.slice(0, 8)}...
                            </p>
                        {:else}
                            <p class="text-sm text-muted-foreground">Model not found</p>
                        {/if}
                    </div>

                    <!-- Components list -->
                    <div class="mt-5 mb-2 flex items-center gap-2">
                        <p class="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
                            Components
                        </p>
                        <div class="h-px flex-1 bg-border/60"></div>
                    </div>

                    <div class="space-y-2">
                        {#each entity.components as comp (comp.id)}
                            <div class="group flex items-center justify-between rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-sm">
                                <span>{comp.name}</span>
                            </div>
                        {/each}
                    </div>
                {/if}
            {:else}
                <h2 class="text-xl font-bold text-foreground">Properties</h2>
                <p class="mt-2 text-sm text-muted-foreground">
                    Select an entity in the world to view its properties.
                </p>

                <!-- World info when nothing selected -->
                <div class="mt-5 mb-2 flex items-center gap-2">
                    <p class="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
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

                <div class="mt-4 rounded-md border border-border/40 bg-muted/20 p-3">
                    <p class="text-sm text-foreground">{worldData.entities.length} entities</p>
                    <p class="mt-1 text-xs text-muted-foreground">{gameData.models.length} models available</p>
                </div>
            {/if}
        </div>
    </Resizable.Pane>
</Resizable.PaneGroup>
