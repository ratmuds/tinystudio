<script lang="ts">
    import {
        Position,
        Handle,
    } from "@xyflow/svelte";

    let {
        type,
        position,
        id,
        label,
        class: className = "",
        style = "",
    }: {
        type: "source" | "target";
        position: Position;
        id?: string;
        label?: string;
        class?: string;
        style?: string;
    } = $props();

    const labelClasses: Record<Position, string> = {
        [Position.Top]: "-top-5 left-1/2 -translate-x-1/2",
        [Position.Bottom]: "-bottom-5 left-1/2 -translate-x-1/2",
        [Position.Left]: "top-1/2 -left-1 -translate-y-1/2 -translate-x-full",
        [Position.Right]: "top-1/2 -right-1 -translate-y-1/2 translate-x-full",
    };
</script>

<Handle
    {type}
    {position}
    {id}
    class={className}
    {style}
>
    {#if label}
        <span
            class="pointer-events-none absolute {labelClasses[position]} whitespace-nowrap rounded border border-border/60 bg-muted px-1 py-px text-[10px] text-muted-foreground"
            >{label}</span
        >
    {/if}
</Handle>
