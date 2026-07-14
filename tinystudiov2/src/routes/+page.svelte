<script lang="ts">
    import MenuBar from "$lib/components/editor/MenuBar.svelte";
    import TabBar from "$lib/components/editor/TabBar.svelte";
    import SplashScreen from "$lib/components/editor/SplashScreen.svelte";
    import WorldWorkspace from "$lib/components/editor/workspaces/WorldWorkspace.svelte";
    import ModelWorkspace from "$lib/components/editor/workspaces/ModelWorkspace.svelte";
    import ScriptWorkspace from "$lib/components/editor/workspaces/ScriptWorkspace.svelte";

    import type { MenuItem, StudioTab, WorkspaceKind } from "$lib/types/editor";

    const menus: Record<string, MenuItem[]> = {
        File: [
            { label: "New World", shortcut: "Ctrl+N" },
            { label: "Open…", shortcut: "Ctrl+O" },
            { separator: true },
            { label: "Save", shortcut: "Ctrl+S" },
            { label: "Save As…", shortcut: "Ctrl+Shift+S" },
            { separator: true },
            { label: "Export Model" },
            { label: "Export Image" },
        ],
        Edit: [
            { label: "Undo", shortcut: "Ctrl+Z" },
            { label: "Redo", shortcut: "Ctrl+Y" },
            { separator: true },
            { label: "Cut", shortcut: "Ctrl+X" },
            { label: "Copy", shortcut: "Ctrl+C" },
            { label: "Paste", shortcut: "Ctrl+V" },
            { label: "Duplicate", shortcut: "Ctrl+D" },
            { separator: true },
            { label: "Delete", shortcut: "Del" },
        ],
        View: [
            { label: "World" },
            { label: "Model" },
            { label: "Script" },
            { separator: true },
            { label: "Toggle Console", shortcut: "`" },
            { label: "Toggle Sidebar" },
        ],
        Object: [
            { label: "Move", shortcut: "W" },
            { label: "Rotate", shortcut: "E" },
            { label: "Scale", shortcut: "R" },
            { separator: true },
            { label: "Group", shortcut: "Ctrl+G" },
            { label: "Ungroup", shortcut: "Ctrl+Shift+G" },
        ],
        Help: [
            { label: "Documentation" },
            { label: "Keyboard Shortcuts" },
            { separator: true },
            { label: "About tinystudio" },
        ],
    };

    let activeWorkspace = $state<WorkspaceKind>("world");

    let tabs = $state<StudioTab[]>([
        { id: "t1", name: "Lobby", kind: "world", dirty: false },
        { id: "t2", name: "Game", kind: "world", dirty: true },
    ]);
    let activeTab = $state("t1");

    let saved = $state(true);
    let saving = $state(false);

    function triggerSave() {
        if (saving) return;
        saving = true;
        saved = false;
        setTimeout(() => {
            saving = false;
            saved = true;
        }, 900);
    }
</script>

<SplashScreen />

<div class="flex h-dvh flex-col">
    <MenuBar
        {menus}
        bind:activeWorkspace
        {saved}
        {saving}
        onsave={triggerSave}
    />

    <TabBar bind:tabs bind:activeTab />

    {#if activeWorkspace === "world"}
        <WorldWorkspace />
    {:else if activeWorkspace === "model"}
        <ModelWorkspace />
    {:else if activeWorkspace === "script"}
        <ScriptWorkspace />
    {/if}
</div>
