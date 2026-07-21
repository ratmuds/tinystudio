<script lang="ts">
    import * as InputGroup from "$lib/components/ui/input-group/index.js";
    import * as ECS from "$lib/stores/ecs";

    let {
        components,
        key = "position",
    }: { components: ECS.Component[]; key?: string } = $props();
    let valuesUnique = $state(false);
    let xValue = $state("");
    let yValue = $state("");
    let zValue = $state("");

    $effect(() => {
        if (components.length > 0) {
            const firstComponent = components[0];
            const firstValue = firstComponent.data[key]?.value;

            // Check if all components have the same value
            valuesUnique = components.every((comp) => {
                const compValue = comp.data[key]?.value;
                return (
                    compValue &&
                    compValue.x === firstValue?.x &&
                    compValue.y === firstValue?.y &&
                    compValue.z === firstValue?.z
                );
            });

            // Set display values
            if (valuesUnique && firstValue) {
                xValue = firstValue.x.toString();
                yValue = firstValue.y.toString();
                zValue = firstValue.z.toString();
            } else {
                xValue = "--";
                yValue = "--";
                zValue = "--";
            }
        } else {
            valuesUnique = false;
            xValue = "";
            yValue = "";
            zValue = "";
        }
    });

    function updateValue(axis: "x" | "y" | "z", newValue: string) {
        const numValue = parseFloat(newValue);
        if (isNaN(numValue)) return;

        // Update all selected components
        for (const comp of components) {
            if (comp.data[key]?.value) {
                comp.data[key].value[axis] = numValue;
            }
        }
    }
</script>

<div class="flex items-center gap-1">
    <InputGroup.Root
        class="my-2 w-full rounded-md border-2 border-border/60 bg-background px-1 py-2 text-sm outline-none focus:border-green-700"
    >
        <InputGroup.Input
            placeholder="X Value"
            bind:value={xValue}
            onchange={(e) => updateValue("x", e.currentTarget.value)}
        />
        <InputGroup.Addon>
            <span class="text-xs text-red-500">X</span>
        </InputGroup.Addon>
    </InputGroup.Root>

    <InputGroup.Root
        class="my-2 w-full rounded-md border-2 border-border/60 bg-background px-1 py-2 text-sm outline-none focus:border-green-700"
    >
        <InputGroup.Input
            placeholder="Y Value"
            bind:value={yValue}
            onchange={(e) => updateValue("y", e.currentTarget.value)}
        />
        <InputGroup.Addon>
            <span class="text-xs text-green-500">Y</span>
        </InputGroup.Addon>
    </InputGroup.Root>

    <InputGroup.Root
        class="my-2 w-full rounded-md border-2 border-border/60 bg-background px-1 py-2 text-sm outline-none focus:border-green-700"
    >
        <InputGroup.Input
            placeholder="Z Value"
            bind:value={zValue}
            onchange={(e) => updateValue("z", e.currentTarget.value)}
        />
        <InputGroup.Addon>
            <span class="text-xs text-blue-500">Z</span>
        </InputGroup.Addon>
    </InputGroup.Root>
</div>
