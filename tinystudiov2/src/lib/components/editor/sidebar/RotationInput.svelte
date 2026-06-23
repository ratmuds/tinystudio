<script lang="ts">
    import * as InputGroup from "$lib/components/ui/input-group/index.js";
    import { Label } from "$lib/components/ui/label/index.js";
    import { Switch } from "$lib/components/ui/switch/index.js";

    import { Move3D, Copy } from "@lucide/svelte";

    let { eulerMode = $bindable(true) } = $props();
</script>

<div class="my-2">
    <div class="flex w-full items-center justify-between space-x-2">
        <p>Rotation</p>

        <div class="flex items-center space-x-2">
            <Label for="rotation-mode"
                >{eulerMode ? "Euler" : "Quaternion"}</Label
            >
            <Switch id="rotation-mode" bind:checked={eulerMode} />
        </div>
    </div>

    <div class="flex items-center gap-1">
        <InputGroup.Root
            class="my-2 w-full rounded-md border-2 border-border/60 bg-background px-1 py-2 text-sm outline-none focus:border-green-700"
        >
            <InputGroup.Input placeholder="X Value" />
            <InputGroup.Addon>
                <span class="text-xs text-red-500">X</span>
            </InputGroup.Addon>
        </InputGroup.Root>

        <InputGroup.Root
            class="my-2 w-full rounded-md border-2 border-border/60 bg-background px-1 py-2 text-sm outline-none focus:border-green-700"
        >
            <InputGroup.Input placeholder="Y Value" />
            <InputGroup.Addon>
                <span class="text-xs text-green-500">Y</span>
            </InputGroup.Addon>
        </InputGroup.Root>

        <InputGroup.Root
            class="my-2 w-full rounded-md border-2 border-border/60 bg-background px-1 py-2 text-sm outline-none focus:border-green-700"
        >
            <InputGroup.Input placeholder="Z Value" />
            <InputGroup.Addon>
                <span class="text-xs text-blue-500">Z</span>
            </InputGroup.Addon>
        </InputGroup.Root>

        {#if !eulerMode}
            <InputGroup.Root
                class="my-2 w-full rounded-md border-2 border-border/60 bg-background px-1 py-2 text-sm outline-none focus:border-green-700"
            >
                <InputGroup.Input placeholder="W Value" />
                <InputGroup.Addon>
                    <span class="text-xs text-purple-500">W</span>
                </InputGroup.Addon>
            </InputGroup.Root>
        {/if}
    </div>
</div>
