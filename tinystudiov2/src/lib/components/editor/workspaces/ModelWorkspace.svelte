<script lang="ts">
    import * as THREE from "three";
    import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
    import Renderer from "$lib/components/editor/Renderer.svelte";

    import * as Resizable from "$lib/components/ui/resizable/index.js";
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
    import { createGeometry, createMesh, type Vec3 } from "$lib/utils/geometry";
    import { performCSG, type CSGOperation } from "$lib/utils/csg";
    import ComponentPropertiesPanel from "$lib/components/editor/sidebar/ComponentPropertiesPanel.svelte";
    import ProgressBar from "$lib/components/editor/ProgressBar.svelte";
    import AddEntityModal from "$lib/components/editor/AddEntityModal.svelte";
    import {
        createCameraHelper,
        syncCameraHelper,
        disposeCameraHelper,
        type CameraHelperEntry,
    } from "$lib/utils/cameraHelper";

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
    // Maps entity ID → camera debug helper (frustum + pick body).
    const cameraHelpers = new Map<string, CameraHelperEntry>();

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
        const size = (meshComp.data.size?.value ?? { x: 1, y: 1, z: 1 }) as Vec3;
        const color = meshComp.data.color.value as number;
        const customGeometry = meshComp.data.customGeometry?.value ?? null;

        const geometry = createGeometry(geomType, size, customGeometry);
        const mesh = createMesh(geometry, color, entity.id);

        const pos = transformComp.data.position.value as Vec3;
        mesh.position.set(pos.x, pos.y, pos.z);
        mesh.userData.partId = entity.id;
        mesh.userData.geometryType = geomType;
        mesh.userData.size = { ...size };
        mesh.userData.customGeometrySig =
            customGeometry?.positions?.length ?? undefined;
        scene.add(mesh);
        meshByEntityId.set(entity.id, mesh);
        return mesh;
    }

    /** Rebuild a mesh's geometry from its Mesh component data. */
    function rebuildMeshGeometry(mesh: THREE.Mesh, meshComp: ECS.Component) {
        const geomType = meshComp.data.geometryType.value as string;
        const size = (meshComp.data.size?.value ?? { x: 1, y: 1, z: 1 }) as Vec3;
        const customGeometry = meshComp.data.customGeometry?.value ?? null;

        mesh.geometry.dispose();
        mesh.geometry = createGeometry(geomType, size, customGeometry);

        mesh.userData.geometryType = geomType;
        mesh.userData.size = { ...size };
        mesh.userData.customGeometrySig =
            customGeometry?.positions?.length ?? undefined;
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
            const customGeometry = meshComp.data.customGeometry?.value ?? null;
            const customCount = customGeometry?.positions?.length ?? 0;

            const geomChanged = customCount > 0
                ? mesh.userData.customGeometrySig !== customCount
                : mesh.userData.geometryType !== geomType ||
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
    }

    /** Create a Camera entity in the ECS and spawn its debug helper. */
    function createCamera() {
        const camCount = modelData.entities.filter((e) =>
            e.components.some((c) => c.name === "Camera"),
        ).length;
        const entity = ECS.createCameraEntity(`Camera ${camCount + 1}`);

        const transform = entity.components.find(
            (c) => c.name === "Transform",
        )!;
        transform.data.position.value = {
            x: +(Math.random() * 4 - 2).toFixed(2),
            y: 1.5,
            z: +(Math.random() * 4 - 2).toFixed(2),
        };

        modelData.entities.push(entity);
        selectedPartIds = [entity.id];
        selectedFaces = [];
    }

    async function handleSave() {
        // TODO: persist to backend / localStorage
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
            createCamera();
        } else if (entityType === "Light") {
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
        }
        addComponentModalOpen = false;
    }

    function deleteEntity(entityId: string) {
        const idx = modelData.entities.findIndex((e) => e.id === entityId);
        if (idx !== -1) {
            modelData.entities.splice(idx, 1);
        }
        const mesh = meshByEntityId.get(entityId);
        if (mesh) {
            scene.remove(mesh);
            mesh.geometry.dispose();
            const mat = mesh.material;
            if (Array.isArray(mat)) {
                for (const m of mat) m.dispose();
            } else if (mat) {
                mat.dispose();
            }
            meshByEntityId.delete(entityId);
        }
        const helper = cameraHelpers.get(entityId);
        if (helper) {
            disposeCameraHelper(helper, scene);
            cameraHelpers.delete(entityId);
        }
        selectedPartIds = selectedPartIds.filter((id) => id !== entityId);
        selectedFaces = selectedFaces.filter((f) => f.entityId !== entityId);
    }

    // ─── CSG (constructive solid geometry) ───────────────────────────────
    let csgOperationModalOpen = $state(false);
    let csgBusy = $state(false);

    function openCSGOperation() {
        if (selectedPartIds.length < 2) {
            alert("Select at least 2 parts to perform a CSG operation.");
            return;
        }
        csgOperationModalOpen = true;
    }

    /** Replace selected entities with a single entity whose mesh is the CSG result. */
    async function applyCSGOperation(operation: CSGOperation) {
        csgOperationModalOpen = false;
        if (csgBusy) return;

        const selectedEntities = selectedPartIds
            .map((id) => modelData.entities.find((e) => e.id === id))
            .filter(
                (e): e is Entity =>
                    !!e &&
                    e.components.some((c) => c.name === "Mesh"),
            );
        const meshes = selectedEntities
            .map((e) => meshByEntityId.get(e.id))
            .filter((m): m is THREE.Mesh => !!m);

        if (meshes.length < 2) {
            alert("Select at least 2 parts with a Mesh component.");
            return;
        }

        csgBusy = true;
        try {
            const result = await performCSG(operation, meshes);

            // Create a fresh part entity to hold the merged geometry.
            const entity = ECS.createPartEntity("CSG Result");
            const meshComp = entity.components.find(
                (c) => c.name === "Mesh",
            )!;
            meshComp.data.geometryType.value = "custom";
            meshComp.data.color.value = result.color;
            meshComp.data.customGeometry.value = result.customGeometry;

            const transform = entity.components.find(
                (c) => c.name === "Transform",
            )!;
            transform.data.position.value = { x: 0, y: 0, z: 0 };
            transform.data.rotation.value = { x: 0, y: 0, z: 0 };
            transform.data.scale.value = { x: 1, y: 1, z: 1 };

            // Remove the original entities first, then add the merged one.
            for (const e of selectedEntities) {
                modelData.entities.splice(
                    modelData.entities.indexOf(e),
                    1,
                );
            }

            modelData.entities.push(entity);
            selectedPartIds = [entity.id];
            selectedFaces = [];
        } catch (e) {
            console.error("CSG operation failed:", e);
            alert("CSG operation failed: " + e);
        } finally {
            csgBusy = false;
        }
    }

    function handleKeydown(e: KeyboardEvent) {
        // Don't trigger shortcuts when typing in inputs
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") return;

        if ((e.key === "a" || e.key === "A") && (e.metaKey || e.ctrlKey || e.shiftKey)) {
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

        // CSG operation
        if (e.key === "o" && !e.metaKey && !e.ctrlKey) {
            e.preventDefault();
            openCSGOperation();
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
                if (entity.components.some((c) => c.name === "Mesh")) {
                    createMeshForEntity(entity);
                }
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

            // Camera entities render as a debug frustum instead of a mesh.
            if (entity.components.some((c) => c.name === "Camera")) {
                let entry: CameraHelperEntry | null | undefined =
                    cameraHelpers.get(entity.id);
                if (!entry) {
                    entry = createCameraHelper(entity, scene);
                    if (entry) cameraHelpers.set(entity.id, entry);
                }
                if (entry && entity.id !== attachedEntityId) {
                    syncCameraHelper(entry, entity);
                }
                continue;
            }

            let mesh = meshByEntityId.get(entity.id);
            if (!mesh) {
                if (entity.components.some((c) => c.name === "Mesh")) {
                    mesh = createMeshForEntity(entity) ?? undefined;
                }
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

        // Remove camera helpers for entities that no longer exist
        for (const [id, entry] of cameraHelpers) {
            if (!seenIds.has(id)) {
                disposeCameraHelper(entry, scene);
                cameraHelpers.delete(id);
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

<AddEntityModal bind:open={addEntityModalOpen} onSelect={handleEntitySelect} />

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

<Command.Dialog bind:open={csgOperationModalOpen} class="rounded-xl p-5">
    <Command.Input placeholder="Choose a CSG operation..." />
    <Command.List class="mt-3">
        <Command.Empty>No results found.</Command.Empty>
        <Command.Group heading="CSG Operations">
            <Command.Item onSelect={() => applyCSGOperation("union")}>
                Union (Combine selected parts)
            </Command.Item>
            <Command.Item onSelect={() => applyCSGOperation("subtract")}>
                Subtract (First minus rest)
            </Command.Item>
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
            <button
                onclick={() => (addEntityModalOpen = true)}
                class="rounded-md p-1.5 text-muted-foreground duration-150 hover:bg-muted/60 hover:text-green-500 active:scale-90"
                aria-label="Add entity"
                title="Add Entity (Shift+A)"
            >
                <Plus class="h-4 w-4" />
            </button>
        </div>

        <div class="min-h-0 flex-1 overflow-auto px-2 py-1">
            {#each modelData.entities as entity (entity.id)}
                {@const isCamera = entity.components.some(
                    (c) => c.name === "Camera",
                )}
                <div
                    class="group mx-1 flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1.5 text-sm duration-100 {selectedPartIds.includes(
                        entity.id,
                    )
                        ? 'bg-green-500/10 text-green-500'
                        : 'text-foreground hover:bg-muted/60'}"
                    onclick={() => (selectedPartIds = [entity.id])}
                >
                    {#if isCamera}
                        <Camera class="h-3.5 w-3.5 shrink-0 text-green-500" />
                    {:else}
                        <Boxes class="h-3.5 w-3.5 shrink-0 text-green-500" />
                    {/if}
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
                                onclick={openCSGOperation}
                                disabled={selectedPartIds.length < 2 || csgBusy}
                                class="rounded-md px-3 py-3 text-sm font-bold tracking-wide shadow-sm duration-150 hover:bg-background/50 hover:text-green-500 disabled:pointer-events-none disabled:opacity-40"
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
            <p class="text-xs text-muted-foreground">Entity · Model</p>
            <p class="mb-4 text-xs text-muted-foreground">
                {selectedPartIds.join(", ")}
            </p>

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
                <ComponentPropertiesPanel
                    components={getSelectedPartComponents()}
                    scripts={gameData.scripts}
                    showAddButton={true}
                    onAddComponent={() => (addComponentModalOpen = true)}
                />
            {/if}
        </div>
    </Resizable.Pane>
</Resizable.PaneGroup>

{#if csgBusy}
    <div
        class="fixed right-5 bottom-5 z-50 w-56 rounded-lg border border-border/60 bg-card/95 p-3 shadow-lg backdrop-blur-sm"
        role="status"
        aria-live="polite"
    >
        <div class="mb-2 flex items-center justify-between gap-3">
            <span class="text-xs font-medium text-foreground">Processing CSG</span>
            <span class="text-[10px] text-muted-foreground">Please wait...</span>
        </div>
        <ProgressBar />
    </div>
{/if}
