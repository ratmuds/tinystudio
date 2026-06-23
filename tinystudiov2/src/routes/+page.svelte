<script lang="ts">
    import * as THREE from "three";
    import ModelPreview from "$lib/components/editor/sidebar/ModelPreview.svelte";
    import MaterialPreview from "$lib/components/editor/sidebar/MaterialPreview.svelte";
    import Vector3Input from "$lib/components/editor/sidebar/Vector3Input.svelte";
    import RotaryInput from "$lib/components/editor/sidebar/RotaryInput.svelte";
    import RotationInput from "$lib/components/editor/sidebar/RotationInput.svelte";
    import ProgressBar from "$lib/components/editor/ProgressBar.svelte";

    import * as Dialog from "$lib/components/ui/dialog/index.js";
    import * as Resizable from "$lib/components/ui/resizable/index.js";
    import * as ContextMenu from "$lib/components/ui/context-menu/index.js";
    import { Separator } from "$lib/components/ui/separator/index.js";
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
        Play,
        Settings,
        Trash2,
        CloudCheck,
        Globe,
        X,
        Newspaper,
    } from "@lucide/svelte";

    import { slide, fly, fade } from "svelte/transition";
    import { quintOut } from "svelte/easing";
    import { onMount } from "svelte";

    let loaded = $state(false);

    onMount(() => {
        const timer = setTimeout(() => (loaded = true), 3000);
        return () => clearTimeout(timer);
    });

    let position = $state({ x: 0, y: 1.5, z: -2.0 });

    let scene = new THREE.Scene();
    let camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.set(position.x, position.y, position.z);

    type NodeType = "group" | "mesh" | "light" | "camera";
    type HierarchyNode = {
        id: string;
        name: string;
        type: NodeType;
        visible: boolean;
        children?: HierarchyNode[];
    };

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

    type MenuItem = {
        label?: string;
        shortcut?: string;
        separator?: boolean;
    };

    const menus: Record<string, MenuItem[]> = {
        File: [
            { label: "New World", shortcut: "Ctrl+N" },
            { label: "Open…", shortcut: "Ctrl+O" },
            { separator: true },
            { label: "Save", shortcut: "Ctrl+S" },
            { label: "Save As…", shortcut: "Ctrl+Shift+S" },
            { separator: true },
            { label: "Export Model" },
            { label: "Export Image" },
        ],
        Edit: [
            { label: "Undo", shortcut: "Ctrl+Z" },
            { label: "Redo", shortcut: "Ctrl+Y" },
            { separator: true },
            { label: "Cut", shortcut: "Ctrl+X" },
            { label: "Copy", shortcut: "Ctrl+C" },
            { label: "Paste", shortcut: "Ctrl+V" },
            { label: "Duplicate", shortcut: "Ctrl+D" },
            { separator: true },
            { label: "Delete", shortcut: "Del" },
        ],
        View: [
            { label: "World" },
            { label: "Model" },
            { label: "Script" },
            { separator: true },
            { label: "Toggle Console", shortcut: "`" },
            { label: "Toggle Sidebar" },
        ],
        Object: [
            { label: "Move", shortcut: "W" },
            { label: "Rotate", shortcut: "E" },
            { label: "Scale", shortcut: "R" },
            { separator: true },
            { label: "Group", shortcut: "Ctrl+G" },
            { label: "Ungroup", shortcut: "Ctrl+Shift+G" },
        ],
        Help: [
            { label: "Documentation" },
            { label: "Keyboard Shortcuts" },
            { separator: true },
            { label: "About tinystudio" },
        ],
    };

    let openMenu = $state<string | null>(null);

    function toggleMenu(name: string) {
        openMenu = openMenu === name ? null : name;
    }

    let metalness = $state(40);
    let roughness = $state(25);
    let meshColor = $state("#6ad8ff");
    let collisionEnabled = $state(false);
    let castShadows = $state(true);
    let mass = $state(1);

    type StudioTab = {
        id: string;
        name: string;
        kind: "world" | "model" | "script";
        dirty: boolean;
    };

    let tabs = $state<StudioTab[]>([
        { id: "t1", name: "Lobby", kind: "world", dirty: false },
        { id: "t2", name: "Game", kind: "world", dirty: true },
        { id: "t3", name: "Leaderboard", kind: "script", dirty: false },
    ]);
    let activeTab = $state("t1");

    function kindIcon(k: StudioTab["kind"]) {
        return k === "world" ? Globe : k === "model" ? Box : Settings;
    }

    function closeTab(id: string, e: MouseEvent) {
        e.stopPropagation();
        const idx = tabs.findIndex((t) => t.id === id);
        tabs = tabs.filter((t) => t.id !== id);
        if (activeTab === id && tabs.length) {
            activeTab = tabs[Math.min(idx, tabs.length - 1)].id;
        }
    }

    let saved = $state(true);
    let saving = $state(false);

    function triggerSave() {
        if (saving) return;
        saving = true;
        saved = false;
        setTimeout(() => {
            saving = false;
            saved = true;
        }, 900);
    }
</script>

<svelte:window onkeydown={(e) => e.key === "Escape" && (openMenu = null)} />

{#if !loaded}
    <div
        class="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-background"
        out:fade={{ duration: 400, easing: quintOut }}
    >
        <div
            class="animate-splash-fade-in pointer-events-none absolute top-0 left-0 h-72 w-72"
            style="background: radial-gradient(circle at top left, rgba(34,197,94,0.12), transparent 70%);"
        ></div>
        <div
            class="animate-splash-fade-in pointer-events-none absolute right-0 bottom-0 h-72 w-72"
            style="background: radial-gradient(circle at bottom right, rgba(34,197,94,0.12), transparent 70%); animation-delay: 0.3s;"
        ></div>
        <div class="flex flex-col items-center gap-4">
            <p class="ArrayFont text-5xl font-semibold">tinystudio</p>
            <div class="w-48">
                <ProgressBar />
            </div>
        </div>
    </div>
{/if}

<div class="flex h-dvh flex-col">
    <!-- Top bar -->
    <div
        class="relative z-50 flex h-12 shrink-0 items-center gap-2 border-b bg-background px-4"
    >
        <div class="flex items-center gap-2 pr-3">
            <p class="ArrayFont text-lg font-semibold">tinystudio</p>
            <p class="text-xs font-bold text-green-500">alpha</p>
        </div>

        <div class="flex items-center gap-0.5">
            {#each Object.keys(menus) as name (name)}
                <div class="relative">
                    <button
                        class="rounded-md px-3 py-1.5 text-sm duration-100 {openMenu ===
                        name
                            ? 'bg-muted text-green-500'
                            : 'hover:bg-muted/60'}"
                        onclick={(e) => {
                            e.stopPropagation();
                            toggleMenu(name);
                        }}
                    >
                        {name}
                    </button>
                    {#if openMenu === name}
                        <div
                            transition:fly={{
                                y: -6,
                                duration: 120,
                                easing: quintOut,
                            }}
                            class="absolute top-full left-0 z-50 mt-1 min-w-52 rounded-lg border border-border/60 bg-popover p-1 shadow-lg"
                        >
                            {#each menus[name] as item, i (i)}
                                {#if item.separator}
                                    <div class="my-1 h-px bg-border/60"></div>
                                {:else}
                                    <button
                                        class="flex w-full items-center justify-between rounded-md px-3 py-1.5 text-sm duration-100 hover:bg-muted"
                                        onclick={() => (openMenu = null)}
                                    >
                                        <span>{item.label}</span>
                                        {#if item.shortcut}
                                            <span
                                                class="ml-8 text-xs text-muted-foreground"
                                                >{item.shortcut}</span
                                            >
                                        {/if}
                                    </button>
                                {/if}
                            {/each}
                        </div>
                    {/if}
                </div>
            {/each}
        </div>

        <!-- Centered studio mode switcher -->
        <div class="pointer-events-none absolute inset-x-0 flex justify-center">
            <div
                class="pointer-events-auto flex items-center gap-1 rounded-lg bg-muted p-1"
            >
                <button
                    class="rounded-md bg-background px-4 py-1 text-sm font-bold tracking-wide text-green-500 shadow-sm"
                    >World</button
                >
                <button
                    class="rounded-md px-4 py-1 text-sm duration-150 hover:bg-background/50"
                    >Model</button
                >
                <button
                    class="rounded-md px-4 py-1 text-sm duration-150 hover:bg-background/50"
                    >Script</button
                >
            </div>
        </div>

        <div class="ml-auto flex items-center gap-3">
            <!-- Save status -->
            <Tooltip.Provider>
                <Tooltip.Root>
                    <Tooltip.Trigger
                        onclick={triggerSave}
                        class="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground duration-150 hover:bg-muted/60 hover:text-foreground"
                        aria-label="Save status"
                    >
                        {#if saving}
                            <CloudCheck
                                class="h-3.5 w-3.5 animate-pulse text-yellow-500"
                            />
                            <span class="text-yellow-500">Saving…</span>
                        {:else if saved}
                            <CloudCheck class="h-3.5 w-3.5 text-green-500" />
                            <span>Saved</span>
                        {:else}
                            <CloudCheck class="h-3.5 w-3.5" />
                            <span>Unsaved</span>
                        {/if}
                    </Tooltip.Trigger>
                    <Tooltip.Content>
                        <p>
                            Save <Kbd.Root class="ml-1 font-bold"
                                >Ctrl+S</Kbd.Root
                            >
                        </p>
                    </Tooltip.Content>
                </Tooltip.Root>
            </Tooltip.Provider>

            <Dialog.Root>
                <Dialog.Trigger
                    class="flex items-center gap-1.5 rounded-md p-2 text-sm text-muted-foreground duration-150 hover:bg-muted/60"
                    ><Newspaper class="h-4 w-4" />
                    <span>View Changelog</span></Dialog.Trigger
                >

                <Dialog.Content
                    class="flex h-3/4 w-3/4 !max-w-none flex-col overflow-hidden rounded-xl !p-0"
                >
                    <div class="relative h-96 w-full overflow-hidden">
                        <img
                            src="/BannerArt.png"
                            alt="Changelog"
                            class="h-full w-full object-cover"
                        />
                        <div
                            class="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/40"
                        >
                            <p
                                class="ArrayFont text-lg font-medium tracking-widest text-white/70 uppercase"
                            >
                                tinystudio
                            </p>
                            <p class="text-6xl font-bold text-white">
                                Version 0.3.0
                            </p>
                        </div>
                    </div>

                    <h1 class="m-3 text-2xl font-bold">New Web Interface!</h1>

                    <div class="mt-2 space-y-3 overflow-auto px-5">
                        <h3 class="text-lg font-bold text-foreground">
                            What's New
                        </h3>
                        <ul class="space-y-2 text-sm text-muted-foreground">
                            <li class="flex items-start gap-2">
                                <span
                                    class="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-green-500"
                                ></span>
                                <span
                                    >Added new Model workspace with improved
                                    viewport controls</span
                                >
                            </li>
                            <li class="flex items-start gap-2">
                                <span
                                    class="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-green-500"
                                ></span>
                                <span
                                    >Material editor now supports real-time
                                    preview with PBR rendering</span
                                >
                            </li>
                            <li class="flex items-start gap-2">
                                <span
                                    class="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-green-500"
                                ></span>
                                <span
                                    >Physics components overhaul — collision,
                                    mass, and shadow casting</span
                                >
                            </li>
                            <li class="flex items-start gap-2">
                                <span
                                    class="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-green-500"
                                ></span>
                                <span
                                    >Hierarchy panel with search, context menus,
                                    and visibility toggles</span
                                >
                            </li>
                            <li class="flex items-start gap-2">
                                <span
                                    class="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-yellow-500"
                                ></span>
                                <span
                                    >Fixed tab bar overflow on smaller screens</span
                                >
                            </li>
                            <li class="flex items-start gap-2">
                                <span
                                    class="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-yellow-500"
                                ></span>
                                <span
                                    >Fixed save indicator not updating correctly
                                    after autosave</span
                                >
                            </li>
                        </ul>
                    </div>
                </Dialog.Content>
            </Dialog.Root>

            <!-- Play button -->
            <Tooltip.Provider>
                <Tooltip.Root>
                    <Tooltip.Trigger
                        onclick={triggerSave}
                        class="group relative flex items-center gap-1.5 overflow-hidden rounded-md bg-gradient-to-b from-green-500 to-green-600 px-3.5 py-1.5 text-sm font-bold text-white shadow-sm duration-150 hover:from-green-400 hover:to-green-500 hover:shadow-md active:scale-95"
                    >
                        <Play
                            class="h-3.5 w-3.5 fill-white transition-transform group-hover:translate-x-0.5"
                        />
                        Play
                    </Tooltip.Trigger>
                    <Tooltip.Content>
                        <p>
                            Play <Kbd.Root class="ml-1 font-bold">F5</Kbd.Root>
                        </p>
                    </Tooltip.Content>
                </Tooltip.Root>
            </Tooltip.Provider>

            <Tooltip.Provider>
                <Tooltip.Root>
                    <Tooltip.Trigger
                        class="rounded-md p-2 duration-150 hover:bg-muted/60"
                        aria-label="Settings"
                    >
                        <Settings class="h-4 w-4" />
                    </Tooltip.Trigger>
                    <Tooltip.Content>
                        <p>
                            Settings <Kbd.Root class="ml-1 font-bold"
                                >Ctrl+,</Kbd.Root
                            >
                        </p>
                    </Tooltip.Content>
                </Tooltip.Root>
            </Tooltip.Provider>
        </div>
    </div>

    <!-- Studio tabs bar -->
    <div
        class="flex h-9 shrink-0 items-center gap-1 overflow-x-auto border-b bg-background px-2"
    >
        {#each tabs as tab (tab.id)}
            {@const TabIcon = kindIcon(tab.kind)}
            <button
                class="group flex shrink-0 items-center gap-2 rounded-md px-3 py-1.5 text-sm duration-150 {activeTab ===
                tab.id
                    ? 'bg-muted text-foreground'
                    : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'}"
                onclick={() => (activeTab = tab.id)}
            >
                <TabIcon class="h-3.5 w-3.5" />
                <span>{tab.name}</span>
                {#if tab.dirty}
                    <span class="h-1.5 w-1.5 rounded-full bg-green-500"></span>
                {/if}
                <span
                    class="-mr-1 flex h-4 w-4 items-center justify-center rounded opacity-0 duration-100 group-hover:opacity-100 hover:bg-foreground/10"
                    role="button"
                    tabindex="-1"
                    onclick={(e) => closeTab(tab.id, e)}
                    aria-label="Close tab"
                >
                    <X class="h-3 w-3" />
                </span>
            </button>
        {/each}
        <Tooltip.Provider>
            <Tooltip.Root>
                <Tooltip.Trigger
                    class="flex shrink-0 items-center justify-center rounded-md p-1.5 text-muted-foreground duration-150 hover:bg-muted/50 hover:text-foreground"
                    aria-label="New tab"
                >
                    <Plus class="h-4 w-4" />
                </Tooltip.Trigger>
                <Tooltip.Content>
                    <p>
                        New Tab <Kbd.Root class="ml-1 font-bold"
                            >Ctrl+T</Kbd.Root
                        >
                    </p>
                </Tooltip.Content>
            </Tooltip.Root>
        </Tooltip.Provider>
    </div>

    <!-- Main content -->
    <Resizable.PaneGroup direction="horizontal" class="min-h-0 flex-1">
        <!-- Hierarchy -->
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
                                                    <ChevronDown
                                                        class="h-3 w-3"
                                                    />
                                                {:else}
                                                    <ChevronRight
                                                        class="h-3 w-3"
                                                    />
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
                                                    node.visible =
                                                        !node.visible;
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
                                                    {node.visible
                                                        ? "Hide"
                                                        : "Show"}
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

        <!-- Viewport -->
        <Resizable.Pane>
            <div
                class="flex h-full w-full flex-col items-center gap-6 bg-background p-8"
            >
                <div
                    class="relative aspect-video w-full overflow-hidden rounded-xl border border-border/60 bg-muted/40"
                    style="background-image: repeating-linear-gradient(45deg, rgba(255,255,255,0.04) 0 10px, transparent 10px 20px);"
                >
                    <div
                        class="absolute inset-0 flex items-center justify-center"
                    >
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
                    <div
                        class="flex items-center gap-1 rounded-lg bg-muted p-1"
                    >
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
                                        Select Tool <Kbd.Root
                                            class="ml-1 font-bold">1</Kbd.Root
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
                                        Move Tool <Kbd.Root
                                            class="ml-1 font-bold">W</Kbd.Root
                                        >
                                    </p>
                                </Tooltip.Content>
                            </Tooltip.Root>
                        </Tooltip.Provider>

                        <Tooltip.Provider>
                            <Tooltip.Root>
                                <Tooltip.Trigger
                                    class="rounded-md px-3 py-3 text-sm font-bold tracking-wide shadow-sm duration-150 hover:bg-background/50"
                                    ><Rotate3D
                                        class="h-4 w-4"
                                    /></Tooltip.Trigger
                                >
                                <Tooltip.Content>
                                    <p>
                                        Rotate Tool <Kbd.Root
                                            class="ml-1 font-bold">E</Kbd.Root
                                        >
                                    </p>
                                </Tooltip.Content>
                            </Tooltip.Root>
                        </Tooltip.Provider>

                        <Tooltip.Provider>
                            <Tooltip.Root>
                                <Tooltip.Trigger
                                    class="rounded-md px-3 py-3 text-sm font-bold tracking-wide shadow-sm duration-150 hover:bg-background/50"
                                    ><Scale3D
                                        class="h-4 w-4"
                                    /></Tooltip.Trigger
                                >
                                <Tooltip.Content>
                                    <p>
                                        Scale Tool <Kbd.Root
                                            class="ml-1 font-bold">R</Kbd.Root
                                        >
                                    </p>
                                </Tooltip.Content>
                            </Tooltip.Root>
                        </Tooltip.Provider>
                    </div>

                    <div
                        class="flex items-center gap-1 rounded-lg bg-muted p-1"
                    >
                        <Tooltip.Provider>
                            <Tooltip.Root>
                                <Tooltip.Trigger
                                    class="rounded-md bg-background px-3 py-3 text-sm font-bold tracking-wide text-green-500 shadow-sm duration-150"
                                    ><Box class="h-4 w-4" /></Tooltip.Trigger
                                >
                                <Tooltip.Content>
                                    <p>Add Cube</p>
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
                                    <p>Add Part</p>
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
                                    <p>Add Model</p>
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

        <!-- Properties -->
        <Resizable.Pane defaultSize={22} class="overflow-hidden border-l">
            <div class="h-full overflow-y-auto p-5">
                <h2 class="text-xl font-bold text-foreground">Properties</h2>
                <p class="mb-4 text-xs text-muted-foreground">Entity · Part</p>

                <p class="mb-1 text-sm text-muted-foreground">Entity Preview</p>
                <ModelPreview {scene} {camera} />

                <!-- Transform -->
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

                <!-- Material -->
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

                <!-- Physics -->
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

                <!-- Components -->
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
                                    Add Component <Kbd.Root
                                        class="ml-1 font-bold"
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
</div>

{#if openMenu}
    <div
        class="fixed inset-0 z-40"
        onclick={() => (openMenu = null)}
        role="button"
        tabindex="0"
        transition:fade={{ duration: 100 }}
    ></div>
{/if}

<style>
    @keyframes splash-fade-in {
        from {
            opacity: 0;
            transform: scale(0.8);
        }
        to {
            opacity: 1;
            transform: scale(1);
        }
    }

    :global(.animate-splash-fade-in) {
        opacity: 0;
        animation: splash-fade-in 1s ease-out forwards;
    }
</style>
