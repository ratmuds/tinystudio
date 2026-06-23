<script lang="ts">
    import * as InputGroup from "$lib/components/ui/input-group/index.js";
    import { Move3D, Copy } from "@lucide/svelte";
</script>

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
</div>
