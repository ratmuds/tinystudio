<script lang="ts">
    import Vector3Input from "$lib/components/editor/sidebar/Vector3Input.svelte";
    import RotationInput from "$lib/components/editor/sidebar/RotationInput.svelte";
    import { Switch } from "$lib/components/ui/switch/index.js";
    import JsonInput from "$lib/components/editor/sidebar/JsonInput.svelte";

    type ComponentEntry = {
        type: string;
        value: any;
    };

    type ComponentData = {
        component: {
            name: string;
            data: Record<string, ComponentEntry>;
        };
        data: any;
    };

    let {
        components,
        scripts = [],
        showAddButton = false,
        onAddComponent,
    }: {
        components: ComponentData[];
        scripts?: { id: string; name: string }[];
        showAddButton?: boolean;
        onAddComponent?: () => void;
    } = $props();
</script>

{#each components as { component, data }}
    <div class="mt-5 mb-2 flex items-center gap-2">
        <p class="font-bold tracking-widest text-muted-foreground uppercase">
            {component.name}
        </p>
        <div class="h-px flex-1 bg-border/60"></div>
    </div>

    {#each Object.entries(component.data) as [key, entry]}
        <div class="flex flex-col gap-3">
            {#if entry.type === "vector3"}
                <div>
                    <p class="mb-1 text-sm">{key}</p>
                    {#if key === "rotation"}
                        <RotationInput components={data} {key} />
                    {:else}
                        <Vector3Input components={data} {key} />
                    {/if}
                </div>
            {:else if entry.type === "string"}
                <div>
                    <p class="mb-1 text-sm">{key}</p>
                    <input
                        type="text"
                        bind:value={entry.value}
                        class="my-2 w-full rounded-md border-2 border-border/60 bg-background px-3 py-2 text-sm duration-150 outline-none focus:border-green-700"
                    />
                </div>
            {:else if entry.type === "number"}
                <div>
                    <p class="mb-1 text-sm">{key}</p>
                    <input
                        type="number"
                        bind:value={entry.value}
                        class="my-2 w-full rounded-md border-2 border-border/60 bg-background px-3 py-2 text-sm duration-150 outline-none focus:border-green-700"
                    />
                </div>
            {:else if entry.type === "boolean"}
                <div class="flex items-center justify-between">
                    <p class="text-sm">{key}</p>
                    <Switch bind:checked={entry.value} />
                </div>
            {:else if entry.type === "color"}
                <div>
                    <p class="mb-1 text-sm">{key}</p>
                    <input
                        type="color"
                        bind:value={entry.value}
                        class="my-2 h-10 w-full rounded-md border-2 border-border/60 bg-background duration-150 outline-none focus:border-green-700"
                    />
                </div>
            {:else if entry.type === "script"}
                <div>
                    <p class="mb-1 text-sm">{key}</p>
                    <select
                        bind:value={entry.value}
                        class="my-2 w-full rounded-md border-2 border-border/60 bg-background px-3 py-2 text-sm duration-150 outline-none focus:border-green-700"
                    >
                        <option value=""> (none) </option>
                        {#each scripts as script}
                            <option value={script.id}>
                                {script.name}
                            </option>
                        {/each}
                    </select>
                </div>
            {:else if entry.type === "json"}
                <JsonInput bind:value={entry.value} label={key} rows={6} />
            {:else}
                <div>
                    <p class="mb-1 text-sm">{key}</p>
                    <input
                        type="text"
                        bind:value={entry.value}
                        class="my-2 w-full rounded-md border-2 border-border/60 bg-background px-3 py-2 text-sm duration-150 outline-none focus:border-green-700"
                    />
                </div>
            {/if}
        </div>
    {/each}
{/each}

{#if showAddButton}
    <button
        onclick={onAddComponent}
        class="mt-4 flex w-full items-center justify-center gap-1.5 rounded-md border-2 border-dashed border-border/60 px-3 py-2 text-sm text-muted-foreground transition-colors hover:border-green-700/60 hover:text-green-500"
    >
        Add Component
    </button>
{/if}
