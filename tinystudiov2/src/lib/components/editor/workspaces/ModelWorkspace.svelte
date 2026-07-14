<script lang="ts">
    import * as THREE from "three";
    import ModelPreview from "$lib/components/editor/sidebar/ModelPreview.svelte";
    import MaterialPreview from "$lib/components/editor/sidebar/MaterialPreview.svelte";
    import Vector3Input from "$lib/components/editor/sidebar/Vector3Input.svelte";
    import RotaryInput from "$lib/components/editor/sidebar/RotaryInput.svelte";
    import RotationInput from "$lib/components/editor/sidebar/RotationInput.svelte";
    import ProgressBar from "$lib/components/editor/ProgressBar.svelte";
    import Renderer from "$lib/components/editor/Renderer.svelte";

    import * as Resizable from "$lib/components/ui/resizable/index.js";
    import * as ContextMenu from "$lib/components/ui/context-menu/index.js";
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
    } from "@lucide/svelte";

    let addEntityModalOpen = $state(false);

    function handleKeydown(e: KeyboardEvent) {
        if (e.key === "a" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            addEntityModalOpen = !addEntityModalOpen;
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

    let obj = new THREE.Mesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshStandardMaterial({ color: 0x00ff00 }),
    );
    obj.userData.partId = "part-1"; // Assign a unique part ID
    scene.add(obj);
</script>

<svelte:document onkeydown={handleKeydown} />

<Command.Dialog bind:open={addEntityModalOpen} class="rounded-xl p-5">
    <Command.Input placeholder="Search for an entity..." />
    <Command.List class="mt-3">
        <Command.Empty>No results found.</Command.Empty>
        <Command.Group heading="Suggestions">
            <Command.Item>Part</Command.Item>
            <Command.Item>Camera</Command.Item>
            <Command.Item>Light</Command.Item>
        </Command.Group>
    </Command.List>
</Command.Dialog>

<Resizable.PaneGroup direction="horizontal" class="min-h-0 flex-1">
    <Resizable.Pane defaultSize={20} class="overflow-hidden border-r">
        <div class="flex h-full flex-col items-center justify-center p-8">
            <p class="text-sm text-muted-foreground">Model workspace</p>
            <p class="mt-1 text-xs text-muted-foreground/60">Coming soon</p>
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
                <Renderer {scene} {camera} />

                <!--
                <div class="absolute inset-0 flex items-center justify-center">
                    <div
                        class="flex flex-col items-center gap-3 text-muted-foreground"
                    >
                        <p class="ArrayFont text-3xl font-semibold">
                            tinystudio
                        </p>

                        <ProgressBar />
                    </div>
                </div>-->
            </div>

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
                                <p>Select Parts</p>
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
                                <p>Select Faces</p>
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
                                <p>Select Models</p>
                            </Tooltip.Content>
                        </Tooltip.Root>
                    </Tooltip.Provider>
                </div>

                <div class="flex items-center gap-1 rounded-lg bg-muted p-1">
                    <Tooltip.Provider>
                        <Tooltip.Root>
                            <Tooltip.Trigger
                                class="rounded-md px-3 py-3 text-sm font-bold tracking-wide shadow-sm duration-150 hover:bg-background/50 hover:text-green-500"
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
                    class="flex-1 space-y-1.5 overflow-auto p-4 leading-relaxed text-zinc-400"
                >
                    <div
                        class="w-42 overflow-clip rounded-xl border bg-background/50"
                    >
                        <img
                            style="background-image: repeating-linear-gradient(45deg, rgba(255,255,255,0.04) 0 10px, transparent 10px 20px);"
                            class="h-28 w-full object-cover"
                            alt=" "
                        />

                        <div class="mt-1 p-2">
                            <h3 class="text-lg leading-tight text-white">
                                Stud
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
                </div>
            </div>
        </div>
    </Resizable.Pane>

    <Resizable.Handle />

    <Resizable.Pane defaultSize={22} class="overflow-hidden border-l">
        <div class="h-full overflow-y-auto p-5">
            <h2 class="text-xl font-bold text-foreground">Properties</h2>
            <p class="mb-4 text-xs text-muted-foreground">Entity · Model</p>

            <p class="mt-2 text-sm">Model Name</p>
            <input
                type="text"
                value="New Model"
                class="my-2 w-full rounded-md border-2 border-border/60 bg-background px-3 py-2 text-sm duration-150 outline-none focus:border-green-700"
            />

            <button
                class="group relative mt-2 flex gap-1.5 overflow-hidden rounded-md bg-gradient-to-b from-green-500 to-green-600 px-5 py-1.5 text-center text-sm font-bold text-white shadow-sm transition-[transform,background-color,box-shadow] duration-150 ease-[cubic-bezier(0.34,1.56,0.64,1)] hover:from-green-400 hover:to-green-500 hover:shadow-md active:scale-95"
                >Save Model</button
            >
        </div>
    </Resizable.Pane>
</Resizable.PaneGroup>
