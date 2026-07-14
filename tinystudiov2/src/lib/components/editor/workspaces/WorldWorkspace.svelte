<script lang="ts">
    import * as THREE from "three";
    import ModelPreview from "$lib/components/editor/sidebar/ModelPreview.svelte";
    import MaterialPreview from "$lib/components/editor/sidebar/MaterialPreview.svelte";
    import Vector3Input from "$lib/components/editor/sidebar/Vector3Input.svelte";
    import RotaryInput from "$lib/components/editor/sidebar/RotaryInput.svelte";
    import RotationInput from "$lib/components/editor/sidebar/RotationInput.svelte";
    import ProgressBar from "$lib/components/editor/ProgressBar.svelte";

    import * as Resizable from "$lib/components/ui/resizable/index.js";
    import * as ContextMenu from "$lib/components/ui/context-menu/index.js";
    import { Switch } from "$lib/components/ui/switch/index.js";
    import * as Tooltip from "$lib/components/ui/tooltip/index.js";
    import * as Kbd from "$lib/components/ui/kbd/index.js";

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
    } from "@lucide/svelte";

    import { slide } from "svelte/transition";
    import { quintOut } from "svelte/easing";
    import type { HierarchyNode, NodeType } from "$lib/types/editor";

    let position = $state({ x: 0, y: 1.5, z: -2.0 });

    let scene = new THREE.Scene();
    let camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.set(position.x, position.y, position.z);

    let hierarchy: HierarchyNode[] = $state([
        {
            id: "world",
            name: "World",
            type: "group",
            visible: true,
            children: [
                {
                    id: "player",
                    name: "Player",
                    type: "group",
                    visible: true,
                    children: [
                        {
                            id: "body",
                            name: "Body",
                            type: "mesh",
                            visible: true,
                        },
                        {
                            id: "head",
                            name: "Head",
                            type: "mesh",
                            visible: true,
                        },
                        {
                            id: "hat",
                            name: "Hat",
                            type: "mesh",
                            visible: false,
                        },
                    ],
                },
                { id: "cube", name: "Cube", type: "mesh", visible: true },
                { id: "floor", name: "Floor", type: "mesh", visible: true },
                {
                    id: "lights",
                    name: "Lights",
                    type: "group",
                    visible: true,
                    children: [
                        {
                            id: "sun",
                            name: "Sun",
                            type: "light",
                            visible: true,
                        },
                        {
                            id: "ambient",
                            name: "Ambient",
                            type: "light",
                            visible: true,
                        },
                        {
                            id: "rim",
                            name: "Rim Light",
                            type: "light",
                            visible: false,
                        },
                    ],
                },
                {
                    id: "maincam",
                    name: "MainCamera",
                    type: "camera",
                    visible: true,
                },
            ],
        },
    ]);

    let selectedId = $state<string | null>("cube");
    let expanded = $state<Set<string>>(new Set(["world", "player"]));
    let query = $state("");

    function toggleExpand(id: string) {
        const next = new Set(expanded);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        expanded = next;
    }

    function typeIcon(type: NodeType) {
        switch (type) {
            case "light":
                return Sun;
            case "camera":
                return Camera;
            case "group":
                return Layers;
            default:
                return Box;
        }
    }

    function typeColor(type: NodeType, visible: boolean) {
        if (!visible) return "text-muted-foreground/50";
        switch (type) {
            case "light":
                return "text-yellow-500";
            case "camera":
                return "text-blue-400";
            case "group":
                return "text-green-500";
            default:
                return "text-muted-foreground";
        }
    }

    let metalness = $state(40);
    let roughness = $state(25);
    let meshColor = $state("#6ad8ff");
    let collisionEnabled = $state(false);
    let castShadows = $state(true);
    let mass = $state(1);
</script>

<Resizable.PaneGroup direction="horizontal" class="min-h-0 flex-1">
    <Resizable.Pane defaultSize={20} class="overflow-hidden border-r">
        <div class="flex h-full flex-col">
            <div
                class="flex shrink-0 items-center justify-between border-b border-border/60 px-4 py-3"
            >
                <h2
                    class="text-xs font-bold tracking-widest text-foreground uppercase"
                >
                    Objects
                </h2>
                <Tooltip.Provider>
                    <Tooltip.Root>
                        <Tooltip.Trigger
                            class="rounded-md p-1 text-muted-foreground duration-100 hover:bg-muted hover:text-foreground"
                            aria-label="Add object"
                        >
                            <Plus class="h-4 w-4" />
                        </Tooltip.Trigger>
                        <Tooltip.Content>
                            <p>
                                Add Object <Kbd.Root class="ml-1 font-bold"
                                    >Ctrl+A</Kbd.Root
                                >
                            </p>
                        </Tooltip.Content>
                    </Tooltip.Root>
                </Tooltip.Provider>
            </div>

            <div class="shrink-0 border-b border-border/60 p-2">
                <div
                    class="flex items-center gap-2 rounded-md bg-muted/50 px-2 py-1.5"
                >
                    <Search class="h-3.5 w-3.5 text-muted-foreground" />
                    <input
                        type="text"
                        bind:value={query}
                        placeholder="Search…"
                        class="flex-1 bg-transparent text-xs text-foreground placeholder-muted-foreground outline-none"
                    />
                </div>
            </div>

            <div class="min-h-0 flex-1 overflow-auto px-2 py-1">
                {#snippet row(node: HierarchyNode, depth: number)}
                    {@const Icon = typeIcon(node.type)}
                    {@const hasChildren = !!node.children?.length}
                    <div>
                        <ContextMenu.Root>
                            <ContextMenu.Trigger
                                class="group mx-1 flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1.5 text-sm duration-100 {selectedId ===
                                node.id
                                    ? 'bg-green-500/10 text-green-500'
                                    : 'text-foreground hover:bg-muted/60'}"
                                style="padding-left: {depth * 14 + 6}px"
                                onclick={() => (selectedId = node.id)}
                            >
                                <span
                                    class="flex h-4 w-4 shrink-0 items-center justify-center"
                                >
                                    {#if hasChildren}
                                        <button
                                            class="flex h-4 w-4 items-center justify-center rounded duration-100 hover:bg-muted"
                                            onclick={(e) => {
                                                e.stopPropagation();
                                                toggleExpand(node.id);
                                            }}
                                            aria-label="Toggle"
                                        >
                                            {#if expanded.has(node.id)}
                                                <ChevronDown class="h-3 w-3" />
                                            {:else}
                                                <ChevronRight class="h-3 w-3" />
                                            {/if}
                                        </button>
                                    {/if}
                                </span>

                                <Icon
                                    class="h-3.5 w-3.5 shrink-0 {typeColor(
                                        node.type,
                                        node.visible,
                                    )}"
                                />

                                <span
                                    class="flex-1 truncate {node.visible
                                        ? ''
                                        : 'text-muted-foreground/60 line-through'}"
                                    >{node.name}</span
                                >

                                <Tooltip.Provider>
                                    <Tooltip.Root>
                                        <Tooltip.Trigger
                                            class="shrink-0 rounded p-0.5 duration-100 {node.visible
                                                ? 'opacity-0 group-hover:opacity-100'
                                                : 'opacity-100'}"
                                            onclick={(e) => {
                                                e.stopPropagation();
                                                node.visible = !node.visible;
                                            }}
                                            aria-label="Toggle visibility"
                                        >
                                            {#if node.visible}
                                                <Eye class="h-3 w-3" />
                                            {:else}
                                                <EyeOff class="h-3 w-3" />
                                            {/if}
                                        </Tooltip.Trigger>
                                        <Tooltip.Content>
                                            <p>
                                                {node.visible ? "Hide" : "Show"}
                                            </p>
                                        </Tooltip.Content>
                                    </Tooltip.Root>
                                </Tooltip.Provider>
                            </ContextMenu.Trigger>
                            <ContextMenu.Content
                                class="min-w-48 rounded-lg border border-border/60 p-1 shadow-lg"
                            >
                                <ContextMenu.Item>
                                    <Copy class="h-3.5 w-3.5" />
                                    Copy
                                    <ContextMenu.Shortcut
                                        >Ctrl+C</ContextMenu.Shortcut
                                    >
                                </ContextMenu.Item>
                                <ContextMenu.Item>
                                    <Copy class="h-3.5 w-3.5" />
                                    Duplicate
                                    <ContextMenu.Shortcut
                                        >Ctrl+D</ContextMenu.Shortcut
                                    >
                                </ContextMenu.Item>
                                <ContextMenu.Separator />
                                <ContextMenu.Item>
                                    <CornerDownRight class="h-3.5 w-3.5" />
                                    Rename
                                    <ContextMenu.Shortcut
                                        >F2</ContextMenu.Shortcut
                                    >
                                </ContextMenu.Item>
                                <ContextMenu.Item>
                                    <Layers class="h-3.5 w-3.5" />
                                    Group
                                    <ContextMenu.Shortcut
                                        >Ctrl+G</ContextMenu.Shortcut
                                    >
                                </ContextMenu.Item>
                                <ContextMenu.Separator />
                                <ContextMenu.Item variant="destructive">
                                    <Trash2 class="h-3.5 w-3.5" />
                                    Delete
                                    <ContextMenu.Shortcut
                                        >Del</ContextMenu.Shortcut
                                    >
                                </ContextMenu.Item>
                            </ContextMenu.Content>
                        </ContextMenu.Root>

                        {#if hasChildren && expanded.has(node.id)}
                            <div
                                transition:slide={{
                                    duration: 150,
                                    easing: quintOut,
                                }}
                            >
                                {#each node.children as child (child.id)}
                                    {@render row(child, depth + 1)}
                                {/each}
                            </div>
                        {/if}
                    </div>
                {/snippet}

                {#each hierarchy as node (node.id)}
                    {@render row(node, 0)}
                {/each}
            </div>

            <div
                class="shrink-0 border-t border-border/60 px-3 py-2 text-xs text-muted-foreground"
            >
                {hierarchy[0].children?.length ?? 0} objects
            </div>
        </div>
    </Resizable.Pane>

    <Resizable.Handle />

    <Resizable.Pane>
        <div
            class="flex h-full w-full flex-col items-center gap-6 bg-background p-8"
        >
            <div
                class="relative aspect-video w-full overflow-hidden rounded-xl border border-border/60 bg-muted/40"
                style="background-image: repeating-linear-gradient(45deg, rgba(255,255,255,0.04) 0 10px, transparent 10px 20px);"
            >
                <div class="absolute inset-0 flex items-center justify-center">
                    <div
                        class="flex flex-col items-center gap-3 text-muted-foreground"
                    >
                        <p class="ArrayFont text-3xl font-semibold">
                            tinystudio
                        </p>

                        <ProgressBar />
                    </div>
                </div>
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

            <div
                class="flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-lg border border-border/60 bg-card font-mono text-xs shadow-sm"
            >
                <div
                    class="flex items-center gap-1 border-b border-border/60 bg-muted/40 px-2"
                >
                    <button
                        class="border-r border-border/60 px-4 py-2 text-[10px] tracking-widest text-muted-foreground uppercase hover:bg-muted"
                    >
                        console
                    </button>
                    <button
                        class="border-r border-border/60 px-4 py-2 text-[10px] tracking-widest text-muted-foreground uppercase hover:bg-muted"
                    >
                        output
                    </button>
                    <button
                        class="border-r border-border/60 px-4 py-2 text-[10px] tracking-widest text-muted-foreground uppercase hover:bg-muted"
                    >
                        problems
                    </button>
                </div>
                <div
                    class="flex-1 space-y-1.5 overflow-auto p-4 leading-relaxed text-zinc-400"
                >
                    <div class="flex gap-2">
                        <CornerDownRight class="h-3 w-3 text-green-500" />
                        <span class="text-zinc-300"
                            >Engine resources loaded in <span
                                class="text-green-500">1252ms</span
                            ></span
                        >
                    </div>
                    <div class="flex gap-2">
                        <CornerDownRight class="h-3 w-3 text-green-500" />
                        <span class="text-zinc-300"
                            >Web UI loaded in <span class="text-green-500"
                                >3212ms</span
                            ></span
                        >
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

    <Resizable.Pane defaultSize={22} class="overflow-hidden border-l">
        <div class="h-full overflow-y-auto p-5">
            <h2 class="text-xl font-bold text-foreground">Properties</h2>
            <p class="mb-4 text-xs text-muted-foreground">Entity · Part</p>

            <p class="mb-1 text-sm text-muted-foreground">Entity Preview</p>
            <ModelPreview {scene} {camera} />

            <div class="mt-5 mb-2 flex items-center gap-2">
                <p
                    class="text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
                >
                    Transform
                </p>
                <div class="h-px flex-1 bg-border/60"></div>
            </div>

            <p class="mt-2 text-sm">Name</p>
            <input
                type="text"
                value="Cube"
                class="my-2 w-full rounded-md border-2 border-border/60 bg-background px-3 py-2 text-sm duration-150 outline-none focus:border-green-700"
            />

            <p class="mt-2 text-sm">Position</p>
            <Vector3Input />

            <RotationInput />

            <p class="mt-2 text-sm">Scale</p>
            <Vector3Input />

            <p class="mt-2 text-sm">Transparency</p>
            <RotaryInput />

            <div class="mt-5 mb-2 flex items-center gap-2">
                <p
                    class="text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
                >
                    Material
                </p>
                <div class="h-px flex-1 bg-border/60"></div>
            </div>

            <p>Material Preview</p>
            <MaterialPreview />

            <p class="mt-2 text-sm">Color</p>
            <div class="my-2 flex items-center gap-2">
                <label
                    class="relative h-10 w-10 shrink-0 cursor-pointer overflow-hidden rounded-md border-2 border-border/60"
                >
                    <div
                        class="h-full w-full"
                        style="background: {meshColor}"
                    ></div>
                    <input
                        type="color"
                        bind:value={meshColor}
                        class="absolute inset-0 cursor-pointer opacity-0"
                    />
                </label>
                <input
                    type="text"
                    bind:value={meshColor}
                    class="h-10 w-full rounded-md border-2 border-border/60 bg-background px-3 text-sm duration-150 outline-none focus:border-green-700"
                />
            </div>

            <p class="mt-2 text-sm">Metalness</p>
            <RotaryInput bind:value={metalness} />

            <p class="mt-2 text-sm">Roughness</p>
            <RotaryInput bind:value={roughness} />

            <div class="mt-5 mb-2 flex items-center gap-2">
                <p
                    class="text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
                >
                    Physics
                </p>
                <div class="h-px flex-1 bg-border/60"></div>
            </div>

            <div class="my-3 flex items-center justify-between">
                <p class="text-sm">Collision</p>
                <Switch bind:checked={collisionEnabled} />
            </div>

            <div class="my-3 flex items-center justify-between">
                <p class="text-sm">Cast Shadows</p>
                <Switch bind:checked={castShadows} />
            </div>

            {#if collisionEnabled}
                <div transition:slide={{ duration: 150 }}>
                    <p class="mt-2 text-sm">Mass</p>
                    <input
                        type="number"
                        bind:value={mass}
                        min="0"
                        step="0.1"
                        class="my-2 w-full rounded-md border-2 border-border/60 bg-background px-3 py-2 text-sm duration-150 outline-none focus:border-green-700"
                    />
                </div>
            {/if}

            <div class="mt-5 mb-2 flex items-center gap-2">
                <p
                    class="text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
                >
                    Components
                </p>
                <div class="h-px flex-1 bg-border/60"></div>
            </div>

            <div class="mb-2 space-y-2">
                {#each ["MeshRenderer", "BoxCollider"] as comp (comp)}
                    <div
                        class="group flex items-center justify-between rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-sm"
                    >
                        <span>{comp}</span>
                        <button
                            class="text-muted-foreground opacity-0 duration-100 group-hover:opacity-100 hover:text-destructive"
                            aria-label="Remove component"
                        >
                            <Trash2 class="h-3.5 w-3.5" />
                        </button>
                    </div>
                {/each}
                <Tooltip.Provider>
                    <Tooltip.Root>
                        <Tooltip.Trigger
                            class="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-border/60 py-2 text-sm text-muted-foreground duration-150 hover:bg-muted/30"
                        >
                            <Plus class="h-3.5 w-3.5" />
                            Add Component
                        </Tooltip.Trigger>
                        <Tooltip.Content>
                            <p>
                                Add Component <Kbd.Root class="ml-1 font-bold"
                                    >Ctrl+Shift+A</Kbd.Root
                                >
                            </p>
                        </Tooltip.Content>
                    </Tooltip.Root>
                </Tooltip.Provider>
            </div>
        </div>
    </Resizable.Pane>
</Resizable.PaneGroup>
