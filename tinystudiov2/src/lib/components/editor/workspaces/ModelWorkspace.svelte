<script lang="ts">
    import * as THREE from "three";
    import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
    import Vector3Input from "$lib/components/editor/sidebar/Vector3Input.svelte";
    import RotationInput from "$lib/components/editor/sidebar/RotationInput.svelte";
    import Renderer from "$lib/components/editor/Renderer.svelte";

    import * as Resizable from "$lib/components/ui/resizable/index.js";
    import { Switch } from "$lib/components/ui/switch/index.js";
    import * as Tooltip from "$lib/components/ui/tooltip/index.js";
    import * as Kbd from "$lib/components/ui/kbd/index.js";
    import * as Command from "$lib/components/ui/command/index.js";

    import {
        MousePointer2,
        Move3D,
        Rotate3D,
        Scale3D,
        Box,
        SquaresUnite,
        Boxes,
        CornerDownRight,
        Copy,
        ChevronRight,
        ChevronDown,
        Eye,
        EyeOff,
        Camera,
        Search,
        Plus,
        Layers,
        Sun,
        Trash2,
        Link,
        SquaresSubtract,
        Paintbrush,
        CirclePlus,
        FileCode2,
    } from "@lucide/svelte";

    import {
        ModelData,
        ModelWorkspaceData,
        GameData,
    } from "$lib/stores/data.svelte";
    import { createPartEntity, type Entity } from "$lib/stores/ecs.svelte";
    import * as ECS from "$lib/stores/ecs.svelte";
    import { onMount } from "svelte";
    import { generateObjectPreview } from "$lib/threeThumbnailGen";
    import JsonInput from "$lib/components/editor/sidebar/JsonInput.svelte";

    let {
        modelData,
        gameData,
    }: {
        modelData: ModelData;
        gameData: GameData;
    } = $props();

    let workspaceData: ModelWorkspaceData = $derived(
        new ModelWorkspaceData(modelData),
    );

    let addEntityModalOpen = $state(false);
    let addComponentModalOpen = $state(false);
    let saved = $state(false);
    // ─── ECS ↔ Three.js sync ────────────────────────────────────────────
    // Maps entity ID → Three.js mesh so we can update/remove meshes when ECS data changes.
    const meshByEntityId = new Map<string, THREE.Mesh>();

    /** Create the Three.js mesh that corresponds to an ECS Part entity. */
    function createMeshForEntity(entity: Entity): THREE.Mesh | null {
        const meshComp = entity.components.find((c) => c.name === "Mesh");
        const transformComp = entity.components.find(
            (c) => c.name === "Transform",
        );

        if (!meshComp || !transformComp) {
            console.warn(
                `Entity ${entity.id} missing Mesh or Transform component, skipping`,
            );
            return null;
        }

        const geomType = meshComp.data.geometryType.value as string;
        const size = (meshComp.data.size?.value ?? { x: 1, y: 1, z: 1 }) as {
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

        const pos = transformComp.data.position.value as {
            x: number;
            y: number;
            z: number;
        };
        mesh.position.set(pos.x, pos.y, pos.z);
        mesh.userData.entityId = entity.id;
        mesh.userData.partId = entity.id;
        mesh.userData.geometryType = geomType;
        mesh.userData.size = { ...size };
        scene.add(mesh);
        meshByEntityId.set(entity.id, mesh);
        return mesh;
    }

    /** Rebuild a mesh's geometry from its Mesh component data. */
    function rebuildMeshGeometry(mesh: THREE.Mesh, meshComp: ECS.Component) {
        const geomType = meshComp.data.geometryType.value as string;
        const size = (meshComp.data.size?.value ?? { x: 1, y: 1, z: 1 }) as {
            x: number;
            y: number;
            z: number;
        };

        mesh.geometry.dispose();

        switch (geomType) {
            case "sphere":
                mesh.geometry = new THREE.SphereGeometry(size.x / 2);
                break;
            case "cylinder":
                mesh.geometry = new THREE.CylinderGeometry(
                    size.x / 2,
                    size.x / 2,
                    size.y,
                );
                break;
            default:
                mesh.geometry = new THREE.BoxGeometry(size.x, size.y, size.z);
        }

        mesh.userData.geometryType = geomType;
        mesh.userData.size = { ...size };
    }

    /** Update an existing Three.js mesh from its ECS entity data. */
    function syncEntityToMesh(entity: Entity, mesh: THREE.Mesh) {
        const transformComp = entity.components.find(
            (c) => c.name === "Transform",
        );
        const meshComp = entity.components.find((c) => c.name === "Mesh");

        if (transformComp) {
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
            const scale = transformComp.data.scale.value as {
                x: number;
                y: number;
                z: number;
            };

            mesh.position.set(pos.x, pos.y, pos.z);
            mesh.rotation.set(rot.x, rot.y, rot.z);
            mesh.scale.set(scale.x, scale.y, scale.z);
        }

        if (meshComp) {
            const geomType = meshComp.data.geometryType.value as string;
            const size = (meshComp.data.size?.value ?? {
                x: 1,
                y: 1,
                z: 1,
            }) as {
                x: number;
                y: number;
                z: number;
            };
            const color = meshComp.data.color.value as number;

            const geomChanged =
                mesh.userData.geometryType !== geomType ||
                !mesh.userData.size ||
                mesh.userData.size.x !== size.x ||
                mesh.userData.size.y !== size.y ||
                mesh.userData.size.z !== size.z;

            if (geomChanged) {
                rebuildMeshGeometry(mesh, meshComp);
            }

            const material = mesh.material as THREE.MeshStandardMaterial;
            if (material?.color) {
                material.color.setHex(color);
            }
        }
    }

    /** Create a Part entity in the ECS and spawn its 3D mesh. */
    function createPart() {
        const entity = ECS.createPartEntity(
            `Part ${modelData.entities.length + 1}`,
        );

        // Randomize starting position a bit so parts don't all overlap
        const transform = entity.components.find(
            (c) => c.name === "Transform",
        )!;
        const pos = {
            x: +(Math.random() * 4 - 2).toFixed(2),
            y: 0.5,
            z: +(Math.random() * 4 - 2).toFixed(2),
        };
        transform.data.position.value = pos;

        // Randomize color so it's easy to see them
        const mesh = entity.components.find((c) => c.name === "Mesh")!;
        const color = new THREE.Color().setHSL(Math.random(), 0.6, 0.5);
        mesh.data.color.value = color.getHex();

        // Register in ECS data
        modelData.entities.push(entity);

        // Spawn the Three.js mesh
        createMeshForEntity(entity);

        console.log("Created part entity:", entity);
    }

    async function handleSave() {
        // TODO: persist to backend / localStorage
        console.log("Saving model:", modelData);
        saved = true;
        setTimeout(() => (saved = false), 2000);

        modelData.thumbnail = "";
        modelData.thumbnail = await generateObjectPreview(
            modelData.entities,
            256,
        );
    }

    function handleEntitySelect(entityType: string) {
        if (entityType === "Part") {
            createPart();
        } else if (entityType === "Camera") {
            console.log("TODO: Create camera entity");
            // TODO: createCameraEntity()
        } else if (entityType === "Light") {
            console.log("TODO: Create light entity");
            // TODO: createLightEntity()
        }
        addEntityModalOpen = false;
    }

    function handleAddComponent(componentType: string) {
        if (selectedPartIds.length === 0) return;
        const entity = modelData.entities.find(
            (e) => e.id === selectedPartIds[0],
        );
        if (!entity) return;

        if (componentType === "Script") {
            const component = ECS.createScriptComponent();
            entity.components.push(component);
            console.log("Attached Script component to", entity.name);
        }
        addComponentModalOpen = false;
    }

    function handleKeydown(e: KeyboardEvent) {
        // Don't trigger shortcuts when typing in inputs
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") return;

        if (e.key === "a" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            addEntityModalOpen = !addEntityModalOpen;
        }
        if (e.key === "b" && !e.metaKey && !e.ctrlKey) {
            e.preventDefault();
            createPart();
        }

        // Tool shortcuts
        if (e.key === "q") currentTool = "select";
        if (e.key === "w") currentTool = "move";
        if (e.key === "e") currentTool = "rotate";
        if (e.key === "r") currentTool = "scale";

        // Constraint placement
        if (e.key === "c" && !e.metaKey && !e.ctrlKey) {
            e.preventDefault();
            placingConstraint = !placingConstraint;
        }

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

    let scene = new THREE.Scene();
    let camera = new THREE.PerspectiveCamera(
        75,
        window.innerWidth / window.innerHeight,
        0.1,
        1000,
    );
    camera.position.set(3, 3, 3);
    camera.lookAt(0, 0, 0);

    // TransformControls are created by the Renderer component.
    // We bind to them so we can listen for object changes.
    let rendererTransformControls = $state<TransformControls | null>(null);
    let isTransformDragging = $state(false);

    // Selection state (shared with Renderer)
    let selectionMode = $state<"part" | "face" | "model">("part");
    let currentTool = $state<"select" | "move" | "rotate" | "scale">("select");
    let selectedPartIds = $state<string[]>([]);
    let selectedFaces = $state<
        { entityId: string; faceIndex: number; mesh: THREE.Mesh }[]
    >([]);
    let placingConstraint = $state(false);

    function onConstraintCreated(entity: Entity) {
        modelData.entities.push(entity);
        console.log("Constraint created:", entity);
    }

    onMount(() => {
        // Create an initial Part entity if none exist
        if (modelData.entities.length === 0) {
            const initialPart = ECS.createPartEntity("Part 1");
            modelData.entities.push(initialPart);
        }

        // Spawn meshes for all entities
        for (const entity of modelData.entities) {
            if (!meshByEntityId.has(entity.id)) {
                createMeshForEntity(entity);
            }
        }
    });

    // Sync TransformControls object changes back to ECS data
    $effect(() => {
        const tc = rendererTransformControls;
        if (!tc) return;

        const onObjectChange = () => {
            const selectedObject = tc.object as THREE.Mesh;
            if (!selectedObject) return;
            const entityId = selectedObject.userData.entityId as string;
            const entity = modelData.entities.find((e) => e.id === entityId);
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

            // Trigger svelte update
            selectedPartIds = [...selectedPartIds];
        };

        tc.addEventListener("objectChange", onObjectChange);
        return () => tc.removeEventListener("objectChange", onObjectChange);
    });

    // Track when the user is dragging with TransformControls so we don't
    // fight the gizmo by overwriting the mesh transform from ECS every frame.
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

    // Sync ECS data → Three.js meshes (position, rotation, scale, size, color).
    // This makes sidebar Vector3/Rotation inputs and other ECS edits update the
    // rendered model in real time.
    $effect(() => {
        const entities = modelData.entities;
        const seenIds = new Set<string>();

        const attachedObject = rendererTransformControls?.object;
        const attachedEntityId =
            isTransformDragging && attachedObject
                ? ((attachedObject as THREE.Mesh).userData.entityId as string)
                : undefined;

        for (const entity of entities) {
            seenIds.add(entity.id);

            let mesh = meshByEntityId.get(entity.id);
            if (!mesh) {
                mesh = createMeshForEntity(entity) ?? undefined;
            }

            if (mesh && entity.id !== attachedEntityId) {
                syncEntityToMesh(entity, mesh);
            }
        }

        // Remove meshes for entities that no longer exist
        for (const [id, mesh] of meshByEntityId) {
            if (!seenIds.has(id)) {
                scene.remove(mesh);
                mesh.geometry.dispose();
                const mat = mesh.material;
                if (Array.isArray(mat)) {
                    for (const m of mat) m.dispose();
                } else if (mat) {
                    mat.dispose();
                }
                meshByEntityId.delete(id);
            }
        }
    });

    function getSelectedPartComponents() {
        let compTypes = new Map<string, number>(); // component name → count

        // Count the number of each component type across all selected parts
        for (const partId of selectedPartIds) {
            const entity = modelData.entities.find((e) => e.id === partId);
            if (!entity) continue;
            for (const comp of entity.components) {
                compTypes.set(comp.name, (compTypes.get(comp.name) || 0) + 1);
            }
        }

        // Filter components that are shared
        const components: ECS.Component[] = [];
        const componentData = new Map<string, ECS.Component[]>(); // component name → instances
        for (const [compName, count] of compTypes.entries()) {
            if (count === selectedPartIds.length) {
                // All selected parts have this component
                const entity = modelData.entities.find(
                    (e) => e.id === selectedPartIds[0],
                );
                if (!entity) continue;

                const comp = entity.components.find((c) => c.name === compName);

                // Store the component and its per-entity instances
                if (comp) {
                    components.push(comp);
                    const instances: ECS.Component[] = [];
                    for (const id of selectedPartIds) {
                        const e = modelData.entities.find((x) => x.id === id);
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

<Command.Dialog bind:open={addEntityModalOpen} class="rounded-xl p-5">
    <Command.Input placeholder="Search for an entity..." />
    <Command.List class="mt-3">
        <Command.Empty>No results found.</Command.Empty>
        <Command.Group heading="Suggestions">
            <Command.Item onSelect={() => handleEntitySelect("Part")}
                >Part</Command.Item
            >
            <Command.Item onSelect={() => handleEntitySelect("Camera")}
                >Camera</Command.Item
            >
            <Command.Item onSelect={() => handleEntitySelect("Light")}
                >Light</Command.Item
            >
        </Command.Group>
    </Command.List>
</Command.Dialog>

<Command.Dialog bind:open={addComponentModalOpen} class="rounded-xl p-5">
    <Command.Input placeholder="Search for a component..." />
    <Command.List class="mt-3">
        <Command.Empty>No results found.</Command.Empty>
        <Command.Group heading="Components">
            <Command.Item onSelect={() => handleAddComponent("Script")}
                >Script</Command.Item
            >
        </Command.Group>
    </Command.List>
</Command.Dialog>

<Resizable.PaneGroup direction="horizontal" class="min-h-0 flex-1">
    <Resizable.Pane defaultSize={20} class="overflow-hidden border-r">
        <!-- Model entities section -->
        <div
            class="flex shrink-0 items-center justify-between border-b border-border/60 px-4 py-3"
        >
            <h2
                class="text-xs font-bold tracking-widest text-foreground uppercase"
            >
                Model Objects
            </h2>
        </div>

        <div class="min-h-0 flex-1 overflow-auto px-2 py-1">
            {#each modelData.entities as entity (entity.id)}
                <div
                    class="group mx-1 flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1.5 text-sm duration-100 {selectedPartIds.includes(
                        entity.id,
                    )
                        ? 'bg-green-500/10 text-green-500'
                        : 'text-foreground hover:bg-muted/60'}"
                    onclick={() => selectedPartIds.push(entity.id)}
                >
                    <Boxes class="h-3.5 w-3.5 shrink-0 text-green-500" />
                    <span class="flex-1 truncate">{entity.name}</span>
                    <button
                        class="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 duration-100 group-hover:opacity-100 hover:bg-destructive/15 hover:text-destructive"
                        onclick={(e) => {
                            e.stopPropagation();
                        }}
                        aria-label="Delete entity"
                    >
                        <Trash2 class="h-3 w-3" />
                    </button>
                </div>
            {/each}

            {#if modelData.entities.length === 0}
                <p class="px-3 py-4 text-center text-xs text-muted-foreground">
                    No objects in world yet. Spawn a model below.
                </p>
            {/if}
        </div>
    </Resizable.Pane>

    <Resizable.Handle />

    <Resizable.Pane>
        <div
            class="flex h-full w-full flex-col items-center gap-6 bg-background p-8"
        >
            <div
                class="relative aspect-video w-full overflow-hidden rounded-xl border-5 border-border/60 bg-muted/40"
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
                    bind:placingConstraint
                    {onConstraintCreated}
                />
            </div>

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
                                onclick={createPart}
                                class="rounded-md px-3 py-3 text-sm font-bold tracking-wide text-green-400 shadow-sm duration-150 hover:bg-background/50 hover:text-green-300"
                                ><Box class="h-4 w-4" /></Tooltip.Trigger
                            >
                            <Tooltip.Content>
                                <p>
                                    Spawn Cube <Kbd.Root class="ml-1 font-bold"
                                        >B</Kbd.Root
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
                                <p>Select Parts</p>
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

                <div class="flex items-center gap-1 rounded-lg bg-muted p-1">
                    <Tooltip.Provider>
                        <Tooltip.Root>
                            <Tooltip.Trigger
                                onclick={() =>
                                    (placingConstraint = !placingConstraint)}
                                class="rounded-md px-3 py-3 text-sm font-bold tracking-wide shadow-sm duration-150 {placingConstraint
                                    ? 'bg-background text-green-500'
                                    : 'hover:bg-background/50 hover:text-green-500'}"
                                ><Link class="h-4 w-4" /></Tooltip.Trigger
                            >
                            <Tooltip.Content>
                                <p>
                                    Create Constraint <Kbd.Root
                                        class="ml-1 font-bold">C</Kbd.Root
                                    >
                                </p>
                            </Tooltip.Content>
                        </Tooltip.Root>
                    </Tooltip.Provider>

                    <Tooltip.Provider>
                        <Tooltip.Root>
                            <Tooltip.Trigger
                                class="rounded-md px-3 py-3 text-sm font-bold tracking-wide shadow-sm duration-150 hover:bg-background/50 hover:text-green-500"
                                ><SquaresSubtract
                                    class="h-4 w-4"
                                /></Tooltip.Trigger
                            >
                            <Tooltip.Content>
                                <p>
                                    Perform Operation <Kbd.Root
                                        class="ml-1 font-bold">O</Kbd.Root
                                    >
                                </p>
                            </Tooltip.Content>
                        </Tooltip.Root>
                    </Tooltip.Provider>

                    <Tooltip.Provider>
                        <Tooltip.Root>
                            <Tooltip.Trigger
                                class="rounded-md px-3 py-3 text-sm font-bold tracking-wide shadow-sm duration-150 hover:bg-background/50 hover:text-green-500"
                                ><Paintbrush class="h-4 w-4" /></Tooltip.Trigger
                            >
                            <Tooltip.Content>
                                <p>
                                    Apply Textures <Kbd.Root
                                        class="ml-1 font-bold">T</Kbd.Root
                                    >
                                </p>
                            </Tooltip.Content>
                        </Tooltip.Root>
                    </Tooltip.Provider>
                </div>
            </div>

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

                        models
                    </button>
                    <button
                        class="border-r border-border/60 px-4 py-2 text-[10px] tracking-widest text-muted-foreground uppercase hover:bg-muted"
                    >
                        resources
                    </button>
                </div>
                <div
                    class="grid flex-1 grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-1.5 overflow-auto p-4 leading-relaxed text-zinc-400"
                >
                    {#each gameData.models as model}
                        <div
                            class="overflow-clip rounded-xl border bg-background/50 {model.id ===
                            modelData.id
                                ? 'border-2 border-green-700'
                                : ''}"
                        >
                            <img
                                style="background-image: repeating-linear-gradient(45deg, rgba(255,255,255,0.04) 0 10px, transparent 10px 20px);"
                                class="h-28 w-full object-cover"
                                alt=" "
                                src={model.thumbnail}
                            />

                            <div class="mt-1 p-2">
                                <h3 class="text-lg leading-tight text-white">
                                    {model.name}
                                </h3>
                                <p
                                    class="flex items-center gap-1.5 rounded-md text-sm text-muted-foreground transition-all duration-150 ease-[cubic-bezier(0.34,1.56,0.64,1)] hover:bg-muted/60 active:scale-95"
                                >
                                    <Box class="h-3 w-3" /> Model
                                </p>
                                <button
                                    class="group relative mt-2 flex w-full items-center gap-1.5 overflow-hidden rounded-md bg-gradient-to-b from-green-500 to-green-600 px-5 py-1.5 text-center text-sm font-bold text-white shadow-sm transition-all duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] hover:from-green-400 hover:to-green-500 hover:shadow-md active:scale-95"
                                    ><Plus
                                        class="h-4 w-4 fill-white transition-transform group-hover:translate-x-0.5"
                                    /> Spawn</button
                                >
                            </div>
                        </div>
                    {/each}
                </div>
            </div>
        </div>
    </Resizable.Pane>

    <Resizable.Handle />

    <Resizable.Pane defaultSize={22} class="h-full overflow-hidden border-l">
        <div class="h-full overflow-y-auto p-5">
            <h2 class="text-xl font-bold text-foreground">Properties</h2>
            <p class="mb-4 text-xs text-muted-foreground">Entity · Model</p>

            {#if selectedPartIds.length > 0}
                <p
                    class="mb-2 rounded-md bg-muted/60 px-3 py-1.5 text-xs text-green-400"
                >
                    {selectedPartIds.length} part(s) selected{#if selectedFaces.length > 0}
                        · {selectedFaces.length} face(s){/if}
                </p>
            {/if}

            {#if selectedPartIds.length === 0}
                <p class="mt-2 text-sm">Model Name</p>
                <input
                    type="text"
                    bind:value={modelData.name}
                    class="my-2 w-full rounded-md border-2 border-border/60 bg-background px-3 py-2 text-sm duration-150 outline-none focus:border-green-700"
                />

                <button
                    onclick={handleSave}
                    class="group relative mt-2 flex gap-1.5 overflow-hidden rounded-md bg-gradient-to-b from-green-500 to-green-600 px-5 py-1.5 text-center text-sm font-bold text-white shadow-sm transition-[transform,background-color,box-shadow] duration-150 ease-[cubic-bezier(0.34,1.56,0.64,1)] hover:from-green-400 hover:to-green-500 hover:shadow-md active:scale-95"
                    >{saved ? "Saved!" : "Save Model"}</button
                >
            {:else}
                {#each selectedPartIds as partId}
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
                                            <Vector3Input
                                                components={data}
                                                {key}
                                            />
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
                                    <div
                                        class="flex items-center justify-between"
                                    >
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
                                {:else if entry.type === "script"}
                                    <div>
                                        <p class="mb-1 text-sm">{key}</p>
                                        <select
                                            bind:value={entry.value}
                                            class="my-2 w-full rounded-md border-2 border-border/60 bg-background px-3 py-2 text-sm duration-150 outline-none focus:border-green-700"
                                        >
                                            <option value=""> (none) </option>
                                            {#each gameData.scripts as script}
                                                <option value={script.id}>
                                                    {script.name}
                                                </option>
                                            {/each}
                                        </select>
                                    </div>
                                {:else if entry.type === "json"}
                                    <JsonInput
                                        bind:value={entry.value}
                                        label={key}
                                        rows={6}
                                    />
                                {:else if entry.type === "jsonList"}
                                    <JsonInput
                                        bind:value={entry.value}
                                        label={key}
                                        rows={6}
                                    />
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
                {/each}

                <button
                    onclick={() => (addComponentModalOpen = true)}
                    class="mt-4 flex w-full items-center justify-center gap-1.5 rounded-md border-2 border-dashed border-border/60 px-3 py-2 text-sm text-muted-foreground transition-colors hover:border-green-700/60 hover:text-green-500"
                >
                    <CirclePlus class="h-4 w-4" />
                    Add Component
                </button>
            {/if}
        </div>
    </Resizable.Pane>
</Resizable.PaneGroup>
