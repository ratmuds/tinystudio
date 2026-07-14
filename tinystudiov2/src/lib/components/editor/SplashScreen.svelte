<script lang="ts">
    import ProgressBar from "./ProgressBar.svelte";
    import { fade } from "svelte/transition";
    import { quintOut } from "svelte/easing";
    import { onMount } from "svelte";

    let loaded = $state(false);

    onMount(() => {
        const timer = setTimeout(() => (loaded = true), 0);
        return () => clearTimeout(timer);
    });
</script>

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
