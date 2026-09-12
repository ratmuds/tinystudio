<script lang="ts">
    import * as InputGroup from "$lib/components/ui/input-group/index.js";
    import { Label } from "$lib/components/ui/label/index.js";
    import { Switch } from "$lib/components/ui/switch/index.js";
    import * as ECS from "$lib/stores/ecs.svelte";

    import { Move3D, Copy } from "@lucide/svelte";

    let {
        eulerMode = $bindable(true),
        components = $bindable([]),
        key = "rotation",
    }: {
        eulerMode?: boolean;
        components?: ECS.Component[];
        key?: string;
    } = $props();

    let xValue = $state("");
    let yValue = $state("");
    let zValue = $state("");
    let wValue = $state("");
    let valuesUnique = $state(false);

    $effect(() => {
        if (components.length > 0) {
            const firstComponent = components[0];
            const firstValue = firstComponent.data[key]?.value;

            // Check if all components have the same value
            valuesUnique = components.every((comp) => {
                const compValue = comp.data[key]?.value;
                if (!compValue || !firstValue) return false;
                return (
                    compValue.x === firstValue.x &&
                    compValue.y === firstValue.y &&
                    compValue.z === firstValue.z
                );
            });

            // Set display values
            if (valuesUnique && firstValue) {
                xValue = firstValue.x.toString();
                yValue = firstValue.y.toString();
                zValue = firstValue.z.toString();
                if (firstValue.w !== undefined) {
                    wValue = firstValue.w.toString();
                }
            } else {
                xValue = "--";
                yValue = "--";
                zValue = "--";
                wValue = "--";
            }
        } else {
            valuesUnique = false;
            xValue = "";
            yValue = "";
            zValue = "";
            wValue = "";
        }
    });

    function updateValue(axis: "x" | "y" | "z" | "w", newValue: string) {
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

<div class="my-2">
    <div class="flex w-full items-center justify-between space-x-2">
        <p class="mb-1 text-sm">Rotation</p>

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

        {#if !eulerMode}
            <InputGroup.Root
                class="my-2 w-full rounded-md border-2 border-border/60 bg-background px-1 py-2 text-sm outline-none focus:border-green-700"
            >
                <InputGroup.Input
                    placeholder="W Value"
                    bind:value={wValue}
                    onchange={(e) => updateValue("w", e.currentTarget.value)}
                />
                <InputGroup.Addon>
                    <span class="text-xs text-purple-500">W</span>
                </InputGroup.Addon>
            </InputGroup.Root>
        {/if}
    </div>
</div>
