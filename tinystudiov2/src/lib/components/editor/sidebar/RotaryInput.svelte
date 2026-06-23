<script lang="ts">
    import RotarySlider from "$lib/components/editor/sidebar/RotarySlider.svelte";

    let { value = $bindable(0) } = $props();
</script>

<div class="my-2 flex gap-1">
    <div class="p-2 pl-0">
        <RotarySlider bind:value />
    </div>

    <input
        type="number"
        bind:value
        min="0"
        max="100"
        class="h-10 w-full rounded-md border-2 border-border/60 bg-background px-3 text-sm duration-150 outline-none focus:border-green-700"
    />
</div>
