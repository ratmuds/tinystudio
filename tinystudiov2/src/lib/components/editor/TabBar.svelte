<script lang="ts">
    import * as Tooltip from "$lib/components/ui/tooltip/index.js";
    import * as Kbd from "$lib/components/ui/kbd/index.js";
    import { Globe, Box, Settings, Plus, X, Play } from "@lucide/svelte";
    import type { StudioTab } from "$lib/types/editor";

    let {
        tabs = $bindable(),
        activeTab = $bindable(),
    }: {
        tabs: StudioTab[];
        activeTab: string;
    } = $props();

    function kindIcon(kind: StudioTab["kind"]) {
        return kind === "world" ? Globe : kind === "model" ? Box : Settings;
    }

    function closeTab(id: string, e: MouseEvent) {
        e.stopPropagation();
        const idx = tabs.findIndex((t) => t.id === id);
        tabs = tabs.filter((t) => t.id !== id);
        if (activeTab === id && tabs.length) {
            activeTab = tabs[Math.min(idx, tabs.length - 1)].id;
        }
    }
</script>

<div
    class="flex h-9 shrink-0 items-center gap-1 overflow-x-auto border-b bg-background px-2"
>
    {#each tabs as tab (tab.id)}
        {@const TabIcon = kindIcon(tab.kind)}
        <div class="group relative flex shrink-0 items-center">
            <Tooltip.Provider>
                <Tooltip.Root>
                    <Tooltip.Trigger
                        class="relative flex shrink-0 cursor-pointer items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition-all duration-150 ease-[cubic-bezier(0.34,1.56,0.64,1)] select-none active:scale-95 {activeTab ===
                        tab.id
                            ? 'bg-muted text-foreground'
                            : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'}"
                        onclick={() => (activeTab = tab.id)}
                        aria-label={tab.name}
                    >
                        <TabIcon class="h-3.5 w-3.5" />
                        <span>{tab.name}</span>
                        {#if tab.dirty}
                            <span
                                class="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500"
                            ></span>
                        {/if}
                        {#if activeTab === tab.id}
                            <span
                                class="absolute inset-x-2 bottom-0.5 h-0.5 animate-[tab-pop_180ms_ease-out] rounded-full bg-foreground/70"
                            ></span>
                        {/if}
                    </Tooltip.Trigger>
                    <Tooltip.Content
                        sideOffset={6}
                        arrowClasses="bg-popover"
                        class="flex w-72 max-w-72 flex-col items-stretch gap-0 rounded-xl border border-border bg-popover p-0 text-popover-foreground shadow-lg"
                    >
                        <div
                            class="relative aspect-video w-full rounded-t-xl bg-muted"
                        >
                            <div
                                class="absolute inset-0 bg-gradient-to-br from-muted to-muted/30"
                            ></div>
                            <span
                                class="absolute top-2 left-2 rounded bg-background/70 px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-muted-foreground uppercase backdrop-blur-sm"
                            >
                                Preview
                            </span>
                        </div>
                        <div class="flex flex-col gap-1 p-3">
                            <p class="text-sm font-semibold text-foreground">
                                {tab.name}
                            </p>
                            <p
                                class="text-xs leading-relaxed text-muted-foreground"
                            >
                                Modified 1 hour ago
                                <br />
                                Size: 1.2 MB
                            </p>
                        </div>
                    </Tooltip.Content>
                </Tooltip.Root>
            </Tooltip.Provider>
            <button
                type="button"
                class="-ml-1.5 flex h-4 w-4 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 transition-[opacity,transform,background-color,color] duration-150 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover:opacity-100 hover:bg-destructive/15 hover:text-destructive active:scale-90"
                onclick={(e) => closeTab(tab.id, e)}
                aria-label="Close {tab.name} tab"
            >
                <X class="h-3 w-3" />
            </button>
        </div>
    {/each}
    <Tooltip.Provider>
        <Tooltip.Root>
            <Tooltip.Trigger
                class="flex shrink-0 cursor-pointer items-center justify-center rounded-md p-1.5 text-muted-foreground transition-all duration-150 ease-[cubic-bezier(0.34,1.56,0.64,1)] hover:bg-muted/60 hover:text-foreground active:scale-90"
                aria-label="New tab"
            >
                <Plus class="h-4 w-4" />
            </Tooltip.Trigger>
            <Tooltip.Content>
                <p>
                    New Tab <Kbd.Root class="ml-1 font-bold">Ctrl+T</Kbd.Root>
                </p>
            </Tooltip.Content>
        </Tooltip.Root>
    </Tooltip.Provider>
</div>
