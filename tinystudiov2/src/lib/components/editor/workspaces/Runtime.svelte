<script lang="ts">
    import * as THREE from "three";
    import Renderer from "$lib/components/editor/Renderer.svelte";
    import { Play, Square } from "@lucide/svelte";
    import SchedulerPanel from "$lib/components/editor/SchedulerPanel.svelte";

    import { untrack } from "svelte";
    import { RuntimeData, WorldData } from "$lib/stores/data.svelte";
    import {
        clearDirtyFlags,
        createCameraEntity,
        type Component,
        type Entity,
    } from "$lib/stores/ecs.svelte";
    import { MeshSystem } from "$lib/systems/MeshSystem.svelte";
    import { PhysicsSystem } from "$lib/systems/PhysicsSystem.svelte";
    import { ScriptingSystem } from "$lib/systems/ScriptingSystem.svelte";
    import { CameraSystem } from "$lib/systems/CameraSystem.svelte";
    import { EventEmitter } from "$lib/stores/EventEmitter";

    let {
        runtimeData,
    }: {
        runtimeData: RuntimeData;
    } = $props();

    let selectedWorldId = $state("");
    let isRunning = $state(false);
    let animationId = $state<number | null>(null);
    let lastTime = $state(0);

    // The viewport canvas (from the Renderer) that the camera controls attach to.
    let domElement = $state<HTMLElement | null>(null);
    let cameraSystem = $state<CameraSystem | null>(null);

    // Per-run, flat list of cloned, world-space part entities. Each ModelRef
    // world-entity is expanded into per-instance clones of the referenced
    // model's parts (so multiple instances of the same model simulate
    // independently), with their Transforms composed into world space. Systems
    // mutate these clones instead of the source game data, which is reset to
    // [] on stop.
    let runtimeEntities: Entity[] = $state([]);

    function matrixFromTransform(transform: Component): THREE.Matrix4 {
        const p = (transform.data.position.value as any) ?? {
            x: 0,
            y: 0,
            z: 0,
        };
        const r = (transform.data.rotation.value as any) ?? {
            x: 0,
            y: 0,
            z: 0,
        };
        const s = (transform.data.scale.value as any) ?? { x: 1, y: 1, z: 1 };
        return new THREE.Matrix4().compose(
            new THREE.Vector3(p.x, p.y, p.z),
            new THREE.Quaternion().setFromEuler(new THREE.Euler(r.x, r.y, r.z)),
            new THREE.Vector3(s.x, s.y, s.z),
        );
    }

    function applyMatrixToTransform(transform: Component, m: THREE.Matrix4) {
        const pos = new THREE.Vector3();
        const quat = new THREE.Quaternion();
        const scl = new THREE.Vector3();
        m.decompose(pos, quat, scl);
        const euler = new THREE.Euler().setFromQuaternion(quat);
        transform.data.position.value = { x: pos.x, y: pos.y, z: pos.z };
        transform.data.rotation.value = { x: euler.x, y: euler.y, z: euler.z };
        transform.data.scale.value = { x: scl.x, y: scl.y, z: scl.z };
        transform.data.position.dirty = true;
        transform.data.rotation.dirty = true;
        transform.data.scale.dirty = true;
    }

    // Deep clone entity
    /**
     * Clone an entity. If `instanceId` is provided, generates deterministic
     * composite IDs (`instanceId:templateId`) so that:
     *  - Duplicate model instances get unique part IDs
     *  - Re-instantiating the same model produces the same IDs (stable references)
     * Without `instanceId`, fresh random UUIDs are assigned.
     */
    function cloneEntity(entity: Entity, instanceId?: string): Entity {
        const newId = instanceId
            ? `${instanceId}:${entity.id}`
            : crypto.randomUUID();

        return {
            id: newId,
            name: entity.name,
            baseEntity: entity.baseEntity,
            components: entity.components.map((c) => ({
                id: instanceId ? `${instanceId}:${c.id}` : crypto.randomUUID(),
                name: c.name,
                tooltip: c.tooltip,
                data: structuredClone($state.snapshot(c.data)),
            })),
            children: [],
            events: new EventEmitter(),
        } as Entity;
    }

    // Flatten a world into a flat list of world-space runtime parts. ModelRef
    // world-entities are expanded (per-instance) into cloned part entities with
    // composed Transforms; direct world-entities (parts placed in the world)
    // are simply cloned.
    function flattenWorldForRuntime(world: WorldData): Entity[] {
        const out: Entity[] = [];
        for (const worldEntity of world.entities) {
            const modelRef = worldEntity.components.find(
                (c) => c.name === "ModelRef",
            );
            const worldT = worldEntity.components.find(
                (c) => c.name === "Transform",
            );

            if (modelRef && worldT) {
                const modelId = modelRef.data.modelId.value as string;
                const model = runtimeData.gameData.models.find(
                    (m) => m.id === modelId,
                );
                if (!model) continue;

                const mWorld = matrixFromTransform(worldT);
                const instanceId = worldEntity.id;

                for (const templateEntity of model.entities) {
                    const cloned = cloneEntity(templateEntity, instanceId);

                    if (cloned.baseEntity === "constraint") {
                        // Constraints don't have transforms — just remap
                        // entity references to the cloned part IDs
                        const constraintComp = cloned.components.find(
                            (c) => c.name === "Constraint",
                        );
                        if (constraintComp) {
                            const refA = constraintComp.data.entityA
                                .value as string;
                            const refB = constraintComp.data.entityB
                                .value as string;
                            if (refA)
                                constraintComp.data.entityA.value = `${instanceId}:${refA}`;
                            if (refB)
                                constraintComp.data.entityB.value = `${instanceId}:${refB}`;
                        }
                        out.push(cloned);
                        continue;
                    }

                    const partT = cloned.components.find(
                        (c) => c.name === "Transform",
                    );
                    if (!partT) continue;

                    const mPart = matrixFromTransform(partT);
                    const mComposed = mWorld.clone().multiply(mPart);
                    applyMatrixToTransform(partT, mComposed);

                    out.push(cloned);
                }
            } else {
                out.push(cloneEntity(worldEntity));
            }
        }
        return out;
    }

    // Initialize selected world from runtimeData
    $effect(() => {
        if (!selectedWorldId && runtimeData.gameData.worlds.length > 0) {
            selectedWorldId = runtimeData.gameData.worlds[0].id;
        }
    });

    let worldData = $derived(
        runtimeData.gameData.worlds.find((w) => w.id === selectedWorldId),
    );

    // Three.js scene
    let scene = $derived.by(() => {
        const s = new THREE.Scene();
        s.background = new THREE.Color(0x1a1a2e);
        return s;
    });

    let camera = $derived.by(() => {
        const c = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
        c.position.set(6, 5, 8);
        c.lookAt(0, 0, 0);
        return c;
    });

    // Lights
    $effect(() => {
        const ambientLight = new THREE.AmbientLight(0xffffff, 1.6);
        scene.add(ambientLight);

        const dirLight = new THREE.DirectionalLight(0xffffff, 2.5);
        dirLight.position.set(5, 10, 5);
        dirLight.castShadow = true;
        dirLight.shadow.mapSize.set(1024, 1024);
        scene.add(dirLight);
    });

    function gameLoop(time: number) {
        if (!isRunning) return;

        const deltaTime = (time - lastTime) / 1000;
        lastTime = time;

        const entities = runtimeEntities;
        for (const system of runtimeData.systems) {
            system.update(deltaTime, entities);
        }

        animationId = requestAnimationFrame(gameLoop);
    }

    async function startRuntime() {
        if (!worldData) {
            console.warn("No world data available.");
            return;
        }
        isRunning = true;

        // Flatten world into per-instance, world-space part clones that the
        // systems can mutate without touching the source game data.
        runtimeEntities = flattenWorldForRuntime(worldData);

        // Ensure there's a camera entity to drive the viewport. If the world
        // defines one (Camera.active), that wins; otherwise spawn a default.
        const hasCamera = runtimeEntities.some((e) =>
            e.components.some((c) => c.name === "Camera"),
        );
        if (!hasCamera) {
            const defaultCamera = createCameraEntity("Default Camera");
            const transform = defaultCamera.components.find(
                (c) => c.name === "Transform",
            );
            if (transform) {
                transform.data.position.value = { x: 8, y: 6, z: 12 };
                transform.data.position.dirty = true;
            }
            const cam = defaultCamera.components.find(
                (c) => c.name === "Camera",
            );
            if (cam) cam.data.active.value = true;
            runtimeEntities.push(defaultCamera);
        }

        // Create and register systems
        // Order: scripting (writes transforms) → physics (syncs bodies, steps sim) → mesh (reads transforms)
        const scriptingSystem = new ScriptingSystem(
            scene,
            runtimeData.gameData,
        );
        runtimeData.systems = [scriptingSystem];

        const physicsSystem = new PhysicsSystem(scene, runtimeData.gameData);
        runtimeData.systems.push(physicsSystem);

        const meshSystem = new MeshSystem(scene, runtimeData.gameData);
        runtimeData.systems.push(meshSystem);

        cameraSystem = new CameraSystem(scene, camera, runtimeData.gameData);
        cameraSystem.setDomElement(domElement);
        runtimeData.systems.push(cameraSystem);

        // Setup systems (await async setups like PhysicsSystem)
        for (const system of runtimeData.systems) {
            await system.setup(runtimeEntities);
        }

        // Kick off scripts for entities with Script components
        for (const entity of runtimeEntities) {
            const hasScript = entity.components.some((c) => c.name === "Script");
            if (hasScript) {
                scriptingSystem.startScript(entity);
            }
        }

        // Start game loop
        lastTime = performance.now();
        animationId = requestAnimationFrame(gameLoop);
    }

    function stopRuntime() {
        isRunning = false;
        if (animationId) {
            cancelAnimationFrame(animationId);
            animationId = null;
        }

        // Cleanup systems
        for (const system of runtimeData.systems) {
            system.cleanup();
        }
        runtimeData.systems = [];
        runtimeEntities = [];
        cameraSystem = null;
    }

    function toggleRuntime() {
        if (isRunning) {
            stopRuntime();
        } else {
            startRuntime();
        }
    }

    // Stop runtime when world selection changes
    $effect(() => {
        selectedWorldId;
        if (untrack(() => isRunning)) stopRuntime();
    });

    // Propagate the viewport canvas to the camera system once available.
    $effect(() => {
        if (cameraSystem && domElement) {
            cameraSystem.setDomElement(domElement);
        }
    });

    // Cleanup on destroy
    $effect(() => {
        return () => {
            stopRuntime();
        };
    });
</script>

<div class="flex h-full flex-col">
    <!-- Top bar with world selector and play/stop button -->
    <div
        class="flex items-center gap-4 border-b border-border/60 bg-muted/40 px-4 py-3"
    >
        <h2 class="text-sm font-bold tracking-widest text-foreground uppercase">
            Runtime
        </h2>

        <select
            bind:value={selectedWorldId}
            class="rounded-md border border-border/60 bg-background px-3 py-1.5 text-sm"
        >
            {#each runtimeData.gameData.worlds as world (world.id)}
                <option value={world.id}>{world.name}</option>
            {/each}
        </select>

        <button
            class="flex items-center gap-2 rounded-md px-4 py-2 text-sm font-bold duration-150 active:scale-95 {isRunning
                ? 'bg-red-600 text-white hover:bg-red-500'
                : 'bg-green-600 text-white hover:bg-green-500'} disabled:opacity-50"
            onclick={toggleRuntime}
            disabled={!worldData}
        >
            {#if isRunning}
                <Square class="h-4 w-4" />
                Stop
            {:else}
                <Play class="h-4 w-4" />
                Play
            {/if}
        </button>

        <SchedulerPanel />

        {#if worldData}
            <span class="text-xs text-muted-foreground">
                {worldData.entities.length} entities
            </span>
            <span class="text-xs text-muted-foreground">
                {runtimeData.systems.length} systems
            </span>
            {isRunning ? "Runtime is running." : "Runtime is stopped."}
        {/if}
    </div>

    <!-- 3D Viewport -->
    <div class="flex-1 overflow-hidden">
        {#if worldData}
            <div
                class="relative h-full w-full overflow-hidden bg-muted/40"
                style="background-image: repeating-linear-gradient(45deg, rgba(255,255,255,0.04) 0 10px, transparent 10px 20px);"
            >
                <Renderer
                    {scene}
                    {camera}
                    addLights={false}
                    orbitControls={false}
                    bind:domElement
                />

                {#if !isRunning}
                    <div class="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/25 backdrop-blur-[1px]">
                        <div class="rounded-xl border border-border/60 bg-card/90 px-6 py-4 shadow-xl backdrop-blur-md text-center">
                            <p class="text-sm font-semibold text-foreground">Runtime Stopped</p>
                            <p class="mt-1 text-xs text-muted-foreground">Click "Play" in the top bar to run the game</p>
                        </div>
                    </div>
                {/if}
            </div>

        {:else}
            <div
                class="flex h-full items-center justify-center text-muted-foreground"
            >
                <p>No worlds available. Create a world first.</p>
            </div>
        {/if}
    </div>
</div>
