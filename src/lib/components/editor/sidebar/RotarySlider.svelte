<script lang="ts">
    import { cn } from "$lib/utils";

    type Props = {
        size?: number;
        strokeWidth?: number;
        max?: number;
        min?: number;
        value?: number;
        class?: string;
    };

    let {
        size = 24,
        strokeWidth = 12,
        max = 100,
        min = 0,
        value = $bindable(0),
        class: className = "",
    }: Props = $props();

    const radius = 45;
    const circumference = 2 * Math.PI * radius;

    let dragging = $state(false);
    let lastX = 0;

    const percent = $derived(
        Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100)),
    );
    const progressLength = $derived((percent / 100) * circumference);

    function onPointerDown(e: PointerEvent) {
        dragging = true;
        lastX = e.clientX;
        (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    }

    function onPointerMove(e: PointerEvent) {
        if (!dragging) return;
        const delta = e.clientX - lastX;
        lastX = e.clientX;
        const range = max - min;
        const sensitivity = range / 200;
        value = Math.round(
            Math.max(min, Math.min(max, value + delta * sensitivity)),
        );
    }

    function onPointerUp(e: PointerEvent) {
        dragging = false;
        try {
            (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
        } catch {}
    }
</script>

<div
    class={cn(
        "relative inline-block cursor-ew-resize touch-none select-none",
        className,
    )}
    style:width="{size}px"
    style:height="{size}px"
>
    <svg
        fill="none"
        viewBox="0 0 100 100"
        class="size-full"
        onpointerdown={onPointerDown}
        onpointermove={onPointerMove}
        onpointerup={onPointerUp}
        onpointercancel={onPointerUp}
    >
        <circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            stroke-width={strokeWidth}
            class="stroke-muted"
        />
        <circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            stroke-width={strokeWidth}
            stroke-linecap="round"
            class="stroke-white"
            style="
                stroke-dasharray: {progressLength} {circumference};
                transform: rotate(-90deg);
                transform-origin: 50% 50%;
                transition: stroke-dasharray {dragging ? '0s' : '0.15s'} ease;
            "
        />
    </svg>
</div>
