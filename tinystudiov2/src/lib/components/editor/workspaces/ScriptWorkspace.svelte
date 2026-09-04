<script lang="ts">
    import * as Resizable from "$lib/components/ui/resizable/index.js";
    import MonacoEditor from "$lib/components/editor/MonacoEditor.svelte";
    import JsonInput from "$lib/components/editor/sidebar/JsonInput.svelte";
    import { mode } from "mode-watcher";
    import { setContext } from "svelte";

    import {
        SvelteFlow,
        Controls,
        MiniMap,
        Background,
        BackgroundVariant,
        useNodes,
        useEdges,
    } from "@xyflow/svelte";
    import "@xyflow/svelte/dist/style.css";
    import StateMachineNode from "$lib/components/editor/StateMachineNode.svelte";
    import TerminalNode from "$lib/components/editor/TerminalNode.svelte";

    const nodeTypes = {
        stateMachine: StateMachineNode,
        terminal: TerminalNode,
    };

    import { Plus, FileCode2, Trash2, Workflow, Pencil } from "@lucide/svelte";
    import type { GameData, ScriptData } from "$lib/stores/data.svelte";

    let {
        scriptData,
        gameData,
        openScript,
        onNewScript,
    }: {
        scriptData: ScriptData;
        gameData: GameData;
        openScript?: (s: ScriptData) => void;
        onNewScript?: () => void;
    } = $props();

    let activeBlockIndex = $state(0);
    let currentView: "state-machine" | "script" = $state("state-machine");

    const defaultNodes = [
        {
            id: "start",
            type: "terminal",
            position: { x: 150, y: 0 },
            data: { kind: "start" },
        },
        {
            id: "end",
            type: "terminal",
            position: { x: 150, y: 300 },
            data: { kind: "end" },
        },
    ];

    let nodes = $state.raw(
        scriptData.stateData?.nodes?.length
            ? scriptData.stateData.nodes
            : defaultNodes,
    );
    let edges = $state.raw(scriptData.stateData?.edges ?? []);

    $effect(() => {
        scriptData.stateData = {
            nodes: nodes.map((n: any) => ({ id: n.id, type: n.type, position: n.position, data: n.data })),
            edges: edges.map((e: any) => ({ id: e.id, source: e.source, sourceHandle: e.sourceHandle, target: e.target, targetHandle: e.targetHandle })),
        };
    });

    let scriptFiles = $derived(scriptData.scriptData);

    setContext("logicFiles", () => scriptFiles);

    $effect(() => {
        if (scriptData.scriptData.length === 0) {
            scriptData.scriptData.push({ name: "main", code: "" });
        }
        if (
            activeBlockIndex < 0 ||
            activeBlockIndex >= scriptData.scriptData.length
        ) {
            activeBlockIndex = Math.max(0, scriptData.scriptData.length - 1);
        }
    });

    function addFile() {
        const name = `script_${scriptData.scriptData.length + 1}`;
        scriptData.scriptData.push({ name, code: "" });
        activeBlockIndex = scriptData.scriptData.length - 1;
        currentView = "script";
    }

    function removeFile(i: number) {
        scriptData.scriptData.splice(i, 1);
        if (activeBlockIndex >= scriptData.scriptData.length) {
            activeBlockIndex = Math.max(0, scriptData.scriptData.length - 1);
        }
    }
</script>

<Resizable.PaneGroup direction="horizontal" class="min-h-0 flex-1">
    <Resizable.Pane defaultSize={20} class="overflow-hidden border-r">
        <div
            class="flex shrink-0 items-center justify-between border-b border-border/60 px-4 py-3"
        >
            <h2
                class="text-xs font-bold tracking-widest text-foreground uppercase"
            >
                Logic
            </h2>
            {#if onNewScript}
                <button
                    onclick={onNewScript}
                    class="rounded p-1 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-green-500"
                    aria-label="New logic"
                >
                    <Plus class="h-4 w-4" />
                </button>
            {/if}
        </div>

        <div class="min-h-0 flex-1 overflow-auto px-2 py-1">
            {#each gameData.scripts as script (script.id)}
                <div
                    class="group mx-1 flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1.5 text-sm duration-100 {script.id ===
                    scriptData.id
                        ? 'bg-green-500/10 text-green-500'
                        : 'text-foreground hover:bg-muted/60'}"
                    onclick={() => openScript?.(script)}
                >
                    <Workflow class="h-3.5 w-3.5 shrink-0 text-green-500" />
                    <span class="flex-1 truncate">{script.name}</span>
                    <button
                        class="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 duration-100 group-hover:opacity-100 hover:bg-destructive/15 hover:text-destructive"
                        onclick={(e) => {
                            e.stopPropagation();
                            const idx = gameData.scripts.findIndex(
                                (s) => s.id === script.id,
                            );
                            if (idx >= 0) gameData.scripts.splice(idx, 1);
                        }}
                        aria-label="Delete logic"
                    >
                        <Trash2 class="h-3 w-3" />
                    </button>
                </div>
            {/each}

            {#if gameData.scripts.length === 0}
                <p class="px-3 py-4 text-center text-xs text-muted-foreground">
                    No logic yet. Create one with the + above.
                </p>
            {/if}
        </div>

        <div class="shrink-0 border-t border-border/60 px-4 py-3">
            <div class="mb-2 flex items-center justify-between">
                <span
                    class="text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
                >
                    Files
                </span>
                <button
                    onclick={addFile}
                    class="rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-green-500"
                    aria-label="Add file"
                >
                    <Plus class="h-3.5 w-3.5" />
                </button>
            </div>

            {#each scriptFiles as file, i (i)}
                <div
                    class="group flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm duration-100 {i ===
                    activeBlockIndex
                        ? 'bg-green-500/10 text-green-500'
                        : 'text-foreground hover:bg-muted/60'}"
                >
                    <button
                        class="flex flex-1 items-center gap-1.5 truncate text-left"
                        onclick={() => {
                            activeBlockIndex = i;
                            currentView = "script";
                        }}
                    >
                        <FileCode2 class="h-3.5 w-3.5 shrink-0" />
                        <span class="truncate"
                            >{file.name || `file_${i + 1}`}</span
                        >
                    </button>
                    <button
                        class="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 duration-100 group-hover:opacity-100 hover:bg-destructive/15 hover:text-destructive"
                        onclick={() => removeFile(i)}
                        aria-label="Remove file"
                    >
                        <Trash2 class="h-3 w-3" />
                    </button>
                </div>
            {/each}
        </div>
    </Resizable.Pane>

    <Resizable.Handle />

    <Resizable.Pane>
        <div class="flex h-full flex-col">
            <div class="flex border-b border-border/60">
                <button
                    class="px-3 py-1.5 text-xs font-medium transition-colors {currentView ===
                    'state-machine'
                        ? 'border-b-2 border-green-500 text-foreground'
                        : 'text-muted-foreground hover:text-foreground'}"
                    onclick={() => (currentView = "state-machine")}
                >
                    State Machine
                </button>
                {#each scriptFiles as file, i (i)}
                    <button
                        class="border-r border-border/60 px-3 py-1.5 text-xs font-medium transition-colors {currentView ===
                            'script' && activeBlockIndex === i
                            ? 'border-b-2 border-green-500 text-foreground'
                            : 'text-muted-foreground hover:text-foreground'}"
                        onclick={() => {
                            activeBlockIndex = i;
                            currentView = "script";
                        }}
                    >
                        {file.name || `file_${i + 1}`}
                    </button>
                {/each}
            </div>

            <div class="min-h-0 flex-1">
                {#if currentView === "state-machine"}
                    <div class="relative h-full w-full">
                        <SvelteFlow
                            bind:nodes
                            bind:edges
                            fitView
                            colorMode="system"
                            {nodeTypes}
                        >
                            <Controls />
                            <Background
                                variant={BackgroundVariant.Dots}
                                gap={12}
                                size={1}
                            />
                        </SvelteFlow>
                        <button
                            class="absolute right-4 bottom-4 flex h-10 w-10 items-center justify-center rounded-full bg-green-600 text-white shadow-lg duration-150 hover:bg-green-500 active:scale-95"
                            onclick={() => {
                                const newId = crypto.randomUUID().slice(0, 8);
                                nodes = [
                                    ...nodes,
                                    {
                                        id: `node-${newId}`,
                                        type: "stateMachine",
                                        position: {
                                            x: Math.random() * 300,
                                            y: Math.random() * 300,
                                        },
                                        data: { text: "" },
                                    },
                                ];
                            }}
                            aria-label="Add node"
                        >
                            <Plus class="h-5 w-5" />
                        </button>
                    </div>
                {:else if currentView === "script"}
                    <div class="h-full w-full">
                        {#if scriptData.scriptData[activeBlockIndex]}
                            {#key activeBlockIndex}
                                <MonacoEditor
                                    language="luau"
                                    bind:value={
                                        scriptData.scriptData[activeBlockIndex].code
                                    }
                                    theme="dark"
                                />
                            {/key}
                        {/if}
                    </div>
                {/if}
            </div>
        </div>
    </Resizable.Pane>

    <Resizable.Handle />

    <Resizable.Pane defaultSize={22} class="h-full overflow-hidden border-l">
        <div class="h-full overflow-y-auto p-5">
            <h2 class="text-xl font-bold text-foreground">Properties</h2>
            <p class="mb-4 text-xs text-muted-foreground">Asset · Logic</p>

            <p class="text-sm">Logic Name</p>
            <input
                type="text"
                bind:value={scriptData.name}
                class="my-2 w-full rounded-md border border-border/60 bg-background px-3 py-1.5 text-sm duration-150 outline-none focus:border-green-700"
            />

            <div class="mt-4 mb-2 flex items-center gap-2">
                <p
                    class="font-bold tracking-widest text-muted-foreground uppercase"
                >
                    State Data
                </p>
                <div class="h-px flex-1 bg-border/60"></div>
            </div>
            <JsonInput bind:value={scriptData.stateData} label="stateData" />

            <div class="mt-4 mb-2 flex items-center gap-2">
                <p
                    class="font-bold tracking-widest text-muted-foreground uppercase"
                >
                    Files
                </p>
                <div class="h-px flex-1 bg-border/60"></div>
                <button
                    onclick={addFile}
                    class="rounded p-1 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-green-500"
                    aria-label="Add file"
                >
                    <Plus class="h-3.5 w-3.5" />
                </button>
            </div>

            {#each scriptData.scriptData as file, i (i)}
                <div
                    class="mb-2 flex items-center gap-1.5 rounded-md border border-border/40 px-2 py-1.5 text-sm {i ===
                    activeBlockIndex
                        ? 'border-green-500/40 bg-green-500/5 text-green-500'
                        : 'text-foreground hover:bg-muted/60'}"
                >
                    <FileCode2 class="h-3.5 w-3.5 shrink-0" />
                    <input
                        type="text"
                        bind:value={file.name}
                        class="flex-1 bg-transparent text-sm outline-none"
                        placeholder="filename"
                    />
                    <button
                        class="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
                        onclick={() => removeFile(i)}
                        aria-label="Remove file"
                    >
                        <Trash2 class="h-3 w-3" />
                    </button>
                </div>
            {/each}
        </div>
    </Resizable.Pane>
</Resizable.PaneGroup>
