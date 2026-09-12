<script lang="ts">
    import * as Dialog from "$lib/components/ui/dialog/index.js";
    import {
        Plus,
        Rocket,
        FolderOpen,
        Download,
        Gamepad2,
        Boxes,
        Layers,
        ChevronRight,
        Upload,
        Check,
    } from "@lucide/svelte";
    import {
        deserializeProject,
        downloadProjectFile,
        readProjectFile,
        createBlankProject,
        type DemoProjectInfo,
    } from "$lib/utils/projectSerializer";
    import { GameData } from "$lib/stores/data.svelte";
    import { onMount } from "svelte";

    let {
        open = $bindable(false),
        hasStarted = $bindable(false),
        gameData,
        onNewProject,
        onLoadProject,
        onSaveProject,
    }: {
        open?: boolean;
        hasStarted?: boolean;
        gameData: GameData;
        onNewProject: () => void;
        onLoadProject: (newGameData: GameData) => void;
        onSaveProject: () => void;
    } = $props();

    let fileInput = $state<HTMLInputElement | null>(null);
    let loadingDemoId = $state<string | null>(null);
    let saveSuccess = $state(false);

    let demoProjects = $state<DemoProjectInfo[]>([

    ]);

    onMount(async () => {
        try {
            const res = await fetch("/demos/demos.json");
            if (res.ok) {
                const list = await res.json();
                if (Array.isArray(list) && list.length > 0) {
                    demoProjects = list;
                }
            }
        } catch {
            // Use default bundled list
        }
    });

    function handleNew() {
        onNewProject();
        hasStarted = true;
        open = false;
    }

    function triggerFileInput() {
        fileInput?.click();
    }

    async function handleFileSelect(e: Event) {
        const input = e.target as HTMLInputElement;
        const file = input.files?.[0];
        if (!file) return;

        try {
            const loaded = await readProjectFile(file);
            onLoadProject(loaded);
            hasStarted = true;
            open = false;
        } catch (err) {
            console.error("Failed to load project file:", err);
            alert("Could not load project file. Please make sure it is a valid TinyStudio JSON file.");
        } finally {
            input.value = "";
        }
    }

    function handleSave() {
        downloadProjectFile(gameData);
        onSaveProject();
        saveSuccess = true;
        setTimeout(() => (saveSuccess = false), 2500);
    }

    async function handleLoadDemo(demo: DemoProjectInfo) {
        loadingDemoId = demo.id;
        try {
            const res = await fetch(`/demos/${demo.filename}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const json = await res.json();
            const project = deserializeProject(json);
            onLoadProject(project);
            hasStarted = true;
            open = false;
        } catch (err) {
            console.error("Failed to load demo:", err);
            alert(`Failed to load demo "${demo.name}".`);
        } finally {
            loadingDemoId = null;
        }
    }
</script>

<input
    bind:this={fileInput}
    type="file"
    accept=".json,application/json"
    class="hidden"
    onchange={handleFileSelect}
/>

<Dialog.Root
    bind:open
    onOpenChange={(isOpen) => {
        if (!isOpen) hasStarted = true;
    }}
>
    <Dialog.Content
        class="!max-w-3xl border border-border/80 bg-background/95 p-6 shadow-2xl backdrop-blur-xl rounded-2xl max-h-[90vh] overflow-y-auto"
    >
        <!-- Header Branding -->
        <div class="flex flex-col items-center justify-center pt-2 pb-5 text-center">
            <div class="flex items-center gap-2.5">
                <p
                    class="ArrayFont text-5xl font-black tracking-tight text-white drop-shadow-md"
                >
                    tinystudio
                </p>
                <span
                    class="rounded-full border border-green-500/40 bg-green-500/15 px-2.5 py-0.5 text-xs font-bold text-green-400"
                >
                    v0.3.0
                </span>
            </div>
            <p class="mt-1.5 text-sm text-muted-foreground max-w-md">
                Create, simulate, and script 3D worlds directly in your browser.
            </p>
        </div>

        <!-- Action Cards Grid -->
        <div
            class="grid gap-3.5 {hasStarted
                ? 'grid-cols-1 sm:grid-cols-3'
                : 'grid-cols-1 sm:grid-cols-2'}"
        >
            <!-- New Project Card -->
            <button
                type="button"
                onclick={handleNew}
                class="group relative flex flex-col items-center justify-center rounded-xl border border-border/70 bg-card/60 p-5 text-center transition-all duration-200 hover:-translate-y-0.5 hover:border-green-500/60 hover:bg-muted/40 hover:shadow-lg hover:shadow-green-500/5 active:scale-95 cursor-pointer"
            >
                <div
                    class="flex h-14 w-14 items-center justify-center rounded-2xl bg-green-500/10 text-green-500 transition-all duration-200 group-hover:scale-110 group-hover:bg-green-500 group-hover:text-white"
                >
                    <Plus class="h-7 w-7" />
                </div>
                <h3 class="mt-3.5 text-base font-bold text-foreground">
                    New Project
                </h3>
                <p class="mt-1 text-xs text-muted-foreground leading-relaxed">
                    Start fresh with a clean world, player, and camera.
                </p>
            </button>

            <!-- Load from File Card -->
            <button
                type="button"
                onclick={triggerFileInput}
                class="group relative flex flex-col items-center justify-center rounded-xl border border-border/70 bg-card/60 p-5 text-center transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-500/60 hover:bg-muted/40 hover:shadow-lg hover:shadow-blue-500/5 active:scale-95 cursor-pointer"
            >
                <div
                    class="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-500 transition-all duration-200 group-hover:scale-110 group-hover:bg-blue-500 group-hover:text-white"
                >
                    <FolderOpen class="h-7 w-7" />
                </div>
                <h3 class="mt-3.5 text-base font-bold text-foreground">
                    Load from File
                </h3>
                <p class="mt-1 text-xs text-muted-foreground leading-relaxed">
                    Open an existing .json project from your computer.
                </p>
            </button>

            <!-- Save Project as File (Shown when user has started working) -->
            {#if hasStarted}
                <button
                    type="button"
                    onclick={handleSave}
                    class="group relative flex flex-col items-center justify-center rounded-xl border border-border/70 bg-card/60 p-5 text-center transition-all duration-200 hover:-translate-y-0.5 hover:border-emerald-500/60 hover:bg-muted/40 hover:shadow-lg hover:shadow-emerald-500/5 active:scale-95 cursor-pointer"
                >
                    <div
                        class="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-500 transition-all duration-200 group-hover:scale-110 group-hover:bg-emerald-500 group-hover:text-white"
                    >
                        {#if saveSuccess}
                            <Check class="h-7 w-7 text-emerald-400" />
                        {:else}
                            <Download class="h-7 w-7" />
                        {/if}
                    </div>
                    <h3 class="mt-3.5 text-base font-bold text-foreground">
                        {saveSuccess ? "Exported!" : "Save as File"}
                    </h3>
                    <p class="mt-1 text-xs text-muted-foreground leading-relaxed">
                        {saveSuccess
                            ? "Downloaded project file"
                            : "Download this project as a .json file."}
                    </p>
                </button>
            {/if}
        </div>

        <!-- Section Divider -->
        <div class="relative my-6">
            <div class="absolute inset-0 flex items-center">
                <div class="w-full border-t border-border/60"></div>
            </div>
            <div class="relative flex justify-center text-xs uppercase">
                <span
                    class="bg-background px-3 font-bold tracking-wider text-muted-foreground"
                >
                    Demo Projects
                </span>
            </div>
        </div>

        <!-- Demo Projects Grid -->
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {#each demoProjects as demo (demo.id)}
                <div
                    class="group flex flex-col justify-between rounded-xl border border-border/70 bg-card/40 p-4 transition-all duration-200 hover:border-green-500/50 hover:bg-muted/30 hover:shadow-md"
                >
                    <div>
                        <div class="flex items-center gap-2.5 mb-2.5">
                            <div
                                class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted/60 text-green-500 group-hover:bg-green-500/20 group-hover:text-green-400 transition-colors"
                            >
                                {#if demo.icon === "gamepad"}
                                    <Gamepad2 class="h-5 w-5" />
                                {:else if demo.icon === "boxes"}
                                    <Boxes class="h-5 w-5" />
                                {:else}
                                    <Rocket class="h-5 w-5" />
                                {/if}
                            </div>
                            <h4
                                class="text-sm font-bold text-foreground truncate"
                            >
                                {demo.name}
                            </h4>
                        </div>

                        <p
                            class="text-xs text-muted-foreground line-clamp-2 leading-relaxed"
                        >
                            {demo.description}
                        </p>

                        <div class="mt-3 flex flex-wrap gap-1">
                            {#each demo.tags as tag}
                                <span
                                    class="rounded bg-muted/70 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
                                >
                                    {tag}
                                </span>
                            {/each}
                        </div>
                    </div>

                    <button
                        type="button"
                        disabled={loadingDemoId === demo.id}
                        onclick={() => handleLoadDemo(demo)}
                        class="mt-4 flex w-full items-center justify-center gap-1.5 rounded-lg bg-green-600/90 py-1.5 text-xs font-bold text-white transition-all duration-150 hover:bg-green-500 active:scale-95 disabled:opacity-50"
                    >
                        {#if loadingDemoId === demo.id}
                            <span>Loading…</span>
                        {:else}
                            <span>Load Demo</span>
                            <ChevronRight class="h-3.5 w-3.5" />
                        {/if}
                    </button>
                </div>
            {/each}
        </div>
    </Dialog.Content>
</Dialog.Root>
