<script lang="ts">
    import { Position, Handle, type NodeProps } from "@xyflow/svelte";
    import { Play, Square } from "@lucide/svelte";

    let { data }: NodeProps = $props();

    let isStart = $derived(data.kind === "start");
</script>

<div
    class="flex min-w-[120px] items-center justify-center rounded-lg border px-4 py-3 shadow-sm {isStart
        ? 'border-green-500/40 bg-green-500/10'
        : 'border-red-500/40 bg-red-500/10'}"
>
    {#if isStart}
        <Play class="mr-2 h-4 w-4 text-green-500" />
        <span class="text-sm font-semibold text-green-500">Start</span>
        <Handle
            type="source"
            position={Position.Bottom}
            class="!h-3 !w-3 !bg-green-500 !border-green-700"
        />
    {:else}
        <Square class="mr-2 h-4 w-4 text-red-400" />
        <span class="text-sm font-semibold text-red-400">End</span>
        <Handle
            type="target"
            position={Position.Top}
            class="!h-3 !w-3 !bg-red-400 !border-red-600"
        />
    {/if}
</div>
