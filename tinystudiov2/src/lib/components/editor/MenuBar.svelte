<script lang="ts">
    import * as Tooltip from "$lib/components/ui/tooltip/index.js";
    import * as Kbd from "$lib/components/ui/kbd/index.js";
    import * as Dialog from "$lib/components/ui/dialog/index.js";
    import {
        Play,
        Settings,
        CloudCheck,
        Newspaper,
        Globe,
        Box,
        Code,
        FolderKanban,
    } from "@lucide/svelte";
    import { fly } from "svelte/transition";
    import { quintOut } from "svelte/easing";
    import type { MenuItem, WorkspaceKind } from "$lib/types/editor";

    let {
        menus,
        activeWorkspace = $bindable(),
        saved,
        saving,
        onsave,
        onplay,
        onopenprojects,
    }: {
        menus: Record<string, MenuItem[]>;
        activeWorkspace: WorkspaceKind;
        saved: boolean;
        saving: boolean;
        onsave: () => void;
        onplay?: () => void;
        onopenprojects?: () => void;
    } = $props();

    let openMenu = $state<string | null>(null);
    let shimmer = $state<{ id: string; n: number } | null>(null);
    let shineTimer: ReturnType<typeof setTimeout> | undefined;

    const workspaces = [
        { id: "world", label: "World", icon: Globe },
        { id: "model", label: "Model", icon: Box },
        { id: "script", label: "Script", icon: Code },
        { id: "test", label: "Test", icon: Play },
    ] as const;

    function toggleMenu(name: string) {
        openMenu = openMenu === name ? null : name;
    }

    function shine(id: string) {
        const n = (shimmer?.id === id ? shimmer.n : 0) + 1;
        shimmer = { id, n };
        clearTimeout(shineTimer);
        shineTimer = setTimeout(() => {
            if (shimmer?.id === id) shimmer = null;
        }, 450);
    }

    function handleKeydown(e: KeyboardEvent) {
        if (e.key === "Escape") openMenu = null;
    }
</script>

<svelte:window onkeydown={handleKeydown} />

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
                    class="rounded-md px-3 py-1.5 text-sm transition-all duration-150 ease-[cubic-bezier(0.34,1.56,0.64,1)] active:scale-95 {openMenu ===
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
                                    class="flex w-full items-center justify-between rounded-md px-3 py-1.5 text-sm duration-100 hover:bg-muted cursor-pointer"
                                    onclick={() => {
                                        openMenu = null;
                                        item.action?.();
                                    }}
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

    <div class="pointer-events-none absolute inset-x-0 flex justify-center">
        <div
            class="pointer-events-auto relative flex items-center gap-1 rounded-xl border border-border/60 bg-muted/70 p-1 shadow-sm backdrop-blur-md"
        >
            {#each workspaces as ws (ws.id)}
                {@const Icon = ws.icon}
                <button
                    type="button"
                    class="relative flex items-center gap-1.5 rounded-lg px-4 py-1 text-sm font-bold tracking-wide transition-[transform,background-color,color,box-shadow] duration-150 ease-[cubic-bezier(0.34,1.56,0.64,1)] active:scale-95 {activeWorkspace ===
                    ws.id
                        ? 'bg-background text-green-500 shadow-sm'
                        : 'text-muted-foreground hover:bg-background/60 hover:text-foreground'}"
                    onclick={() => {
                        activeWorkspace = ws.id;
                        shine(ws.id);
                    }}
                >
                    <Icon class="h-3.5 w-3.5" />
                    <span>{ws.label}</span>
                    {#if shimmer?.id === ws.id}
                        {#key shimmer.n}
                            <span
                                class="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]"
                            >
                                <span
                                    class="absolute inset-y-0 left-0 w-1/3 skew-x-[-12deg] animate-[shimmer-sweep_400ms_ease-out_forwards] bg-gradient-to-r from-transparent via-white/45 to-transparent"
                                ></span>
                            </span>
                        {/key}
                    {/if}
                </button>
            {/each}
        </div>
    </div>

    <div class="ml-auto flex items-center gap-2.5">
        <Tooltip.Provider>
            <Tooltip.Root>
                <Tooltip.Trigger
                    onclick={() => onopenprojects?.()}
                    class="flex items-center gap-1.5 rounded-lg border border-border/70 bg-muted/40 px-3 py-1.5 text-xs font-semibold text-foreground transition-all duration-150 hover:border-green-500/50 hover:bg-muted hover:text-green-400 active:scale-95 cursor-pointer shadow-sm"
                    aria-label="Projects"
                >
                    <FolderKanban class="h-3.5 w-3.5 text-green-500" />
                    <span>Projects</span>
                </Tooltip.Trigger>
                <Tooltip.Content>
                    <p>
                        New, Open, Save, or Load Demo Projects
                    </p>
                </Tooltip.Content>
            </Tooltip.Root>
        </Tooltip.Provider>
        <Tooltip.Provider>
            <Tooltip.Root>
                <Tooltip.Trigger
                    onclick={() => {
                        shine("play");
                        onplay?.();
                    }}
                    class="group relative flex items-center gap-1.5 overflow-hidden rounded-md bg-gradient-to-b from-green-500 to-green-600 px-3.5 py-1.5 text-sm font-bold text-white shadow-sm transition-[transform,background-color,box-shadow] duration-150 ease-[cubic-bezier(0.34,1.56,0.64,1)] hover:from-green-400 hover:to-green-500 hover:shadow-md active:scale-95"
                >
                    <Play
                        class="h-3.5 w-3.5 fill-white transition-transform group-hover:translate-x-0.5"
                    />
                    Play
                    {#if shimmer?.id === "play"}
                        {#key shimmer.n}
                            <span
                                class="pointer-events-none absolute inset-y-0 left-0 z-10 w-1/3 skew-x-[-12deg] animate-[shimmer-sweep_400ms_ease-out_forwards] bg-gradient-to-r from-transparent via-white/50 to-transparent"
                            ></span>
                        {/key}
                    {/if}
                </Tooltip.Trigger>
                <Tooltip.Content>
                    <p>
                        Play
                    </p>
                </Tooltip.Content>
            </Tooltip.Root>
        </Tooltip.Provider>
    </div>
</div>

{#if openMenu}
    <div
        class="fixed inset-0 z-40"
        onclick={() => (openMenu = null)}
        role="button"
        tabindex="0"
    ></div>
{/if}
