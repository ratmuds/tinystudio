<script lang="ts">
    import * as Command from "$lib/components/ui/command/index.js";

    let {
        open = $bindable(false),
        onSelect,
    }: {
        open?: boolean;
        onSelect?: (entityType: string) => void;
    } = $props();
</script>

<Command.Dialog bind:open class="rounded-xl p-5">
    <Command.Input placeholder="Search for an entity..." />
    <Command.List class="mt-3">
        <Command.Empty>No results found.</Command.Empty>
        <Command.Group heading="Suggestions">
            <Command.Item onSelect={() => onSelect?.("Part")}>Part</Command.Item>
            <Command.Item onSelect={() => onSelect?.("Player")}>Player</Command.Item>
            <Command.Item onSelect={() => onSelect?.("Camera")}>Camera</Command.Item>
            <Command.Item onSelect={() => onSelect?.("UI Button")}>UI Button</Command.Item>
            <Command.Item onSelect={() => onSelect?.("UI Text")}>UI Text</Command.Item>
        </Command.Group>
    </Command.List>
</Command.Dialog>
