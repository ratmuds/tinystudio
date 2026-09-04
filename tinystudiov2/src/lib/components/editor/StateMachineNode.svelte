<script lang="ts">
    import {
        Position,
        useSvelteFlow,
        useUpdateNodeInternals,
        type NodeProps,
    } from "@xyflow/svelte";
    import { getContext } from "svelte";
    import FlowHandle from "./FlowHandle.svelte";
    import { Plus, Pencil, X, Workflow, ChevronDown } from "@lucide/svelte";

    let { id, data }: NodeProps = $props();
    let { updateNodeData } = useSvelteFlow();
    let updateNodeInternals = useUpdateNodeInternals();

    const getLogicFiles: () => any[] = getContext("logicFiles");

    interface HandleItem {
        id: string;
        label: string;
    }

    let handles = $derived<HandleItem[]>(((data as any)?.handles ?? []) as HandleItem[]);
    let editingId = $state<string | null>(null);
    let editValue = $state("");
    let showDropdown = $state(false);

    let selectedScript = $derived(((data as any)?.script ?? "") as string);


    function addHandle() {
        const newId = crypto.randomUUID().slice(0, 8);
        const newHandle = { id: newId, label: "Out" };
        const updated = [...handles, newHandle];
        updateNodeData(id, { handles: updated });
        updateNodeInternals(id);
    }

    function startEdit(handleId: string, currentLabel: string) {
        editingId = handleId;
        editValue = currentLabel;
    }

    function confirmEdit() {
        if (editingId && editValue.trim()) {
            const updated = handles.map((h: any) =>
                h.id === editingId ? { ...h, label: editValue.trim() } : h
            );
            updateNodeData(id, { handles: updated });
        }
        editingId = null;
    }

    function cancelEdit() {
        editingId = null;
    }

    function handleKeydown(e: KeyboardEvent) {
        if (e.key === "Enter") confirmEdit();
        if (e.key === "Escape") cancelEdit();
    }

    function deleteHandle(handleId: string) {
        const updated = handles.filter((h: any) => h.id !== handleId);
        updateNodeData(id, { handles: updated });
        updateNodeInternals(id);
    }

    function selectScript(name: string) {
        updateNodeData(id, { script: name });
        showDropdown = false;
    }
</script>

<div
    class="min-w-[200px] rounded-lg border border-border/60 bg-card shadow-sm"
>
    <div class="border-b border-border/60 px-4 py-2.5">
        <div class="flex items-center gap-2 text-muted-foreground">
            <Workflow class="h-3.5 w-3.5 text-green-500" />
            <span class="text-xs font-bold tracking-widest uppercase">State</span>
        </div>
    </div>

    <div class="flex flex-col gap-3 p-4">
        <div>
            <label
                class="mb-1.5 block text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
                >Script</label
            >
            <div class="relative">
                <button
                    class="nodrag flex w-full items-center justify-between rounded-md border border-border/60 bg-background px-3 py-1.5 text-sm text-foreground outline-none duration-150 hover:border-green-700"
                    onclick={() => showDropdown = !showDropdown}
                >
                    <span class="truncate {selectedScript ? '' : 'text-muted-foreground'}">
                        {selectedScript || "Select script..."}
                    </span>
                    <ChevronDown class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                </button>

                {#if showDropdown}
                    <div class="absolute z-50 mt-1 w-full rounded-md border border-border/60 bg-card py-1 shadow-lg">
                        <button
                            class="w-full px-3 py-1.5 text-left text-sm text-muted-foreground hover:bg-muted/60"
                            onclick={() => selectScript("")}
                        >
                            None
                        </button>
                        {#each getLogicFiles() as file}
                            <button
                                class="w-full px-3 py-1.5 text-left text-sm text-foreground hover:bg-muted/60 {selectedScript === file.name ? 'bg-green-500/10 text-green-500' : ''}"
                                onclick={() => selectScript(file.name)}
                            >
                                {file.name}
                            </button>
                        {/each}
                    </div>
                {/if}
            </div>
        </div>

        <div>
            <div class="mb-1.5 flex items-center justify-between">
                <span class="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
                    Outputs
                </span>
                <button
                    class="flex items-center gap-0.5 rounded px-1.5 py-px text-[10px] font-bold text-green-500 duration-150 hover:bg-green-500/10"
                    onclick={addHandle}
                >
                    <Plus class="h-2.5 w-2.5" />
                    Add
                </button>
            </div>

            {#if handles.length > 0}
                <div class="flex flex-col gap-1">
                    {#each handles as handle}
                        <div class="group flex items-center gap-1 rounded-md border border-border/40 bg-muted/40 px-2 py-1">
                            {#if editingId === handle.id}
                                <input
                                    type="text"
                                    bind:value={editValue}
                                    onkeydown={handleKeydown}
                                    onblur={confirmEdit}
                                    class="nodrag w-full flex-1 bg-transparent text-xs text-foreground outline-none"
                                    autofocus
                                />
                            {:else}
                                <span class="flex-1 text-xs text-foreground">
                                    {handle.label}
                                </span>
                                <button
                                    class="rounded p-px text-muted-foreground opacity-0 duration-100 group-hover:opacity-100 hover:text-foreground"
                                    onclick={() => startEdit(handle.id, handle.label)}
                                >
                                    <Pencil class="h-2.5 w-2.5" />
                                </button>
                                <button
                                    class="rounded p-px text-muted-foreground opacity-0 duration-100 group-hover:opacity-100 hover:text-destructive"
                                    onclick={() => deleteHandle(handle.id)}
                                >
                                    <X class="h-2.5 w-2.5" />
                                </button>
                            {/if}
                        </div>
                    {/each}
                </div>
            {:else}
                <p class="text-[10px] text-muted-foreground">No outputs yet</p>
            {/if}
        </div>
    </div>

    <FlowHandle type="target" position={Position.Top} label="In" />

    {#each handles as handle, i}
        <FlowHandle
            type="source"
            position={Position.Bottom}
            id={handle.id}
            label={handle.label}
            style="left: {((i + 1) / (handles.length + 1)) * 100}%"
        />
    {/each}
</div>
