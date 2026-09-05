<script lang="ts">
    import MenuBar from "$lib/components/editor/MenuBar.svelte";
    import TabBar from "$lib/components/editor/TabBar.svelte";
    import SplashScreen from "$lib/components/editor/SplashScreen.svelte";
    import WorldWorkspace from "$lib/components/editor/workspaces/WorldWorkspace.svelte";
    import ModelWorkspace from "$lib/components/editor/workspaces/ModelWorkspace.svelte";
    import ScriptWorkspace from "$lib/components/editor/workspaces/ScriptWorkspace.svelte";
    import RuntimeWorkspace from "$lib/components/editor/workspaces/Runtime.svelte";
    import ProjectsModal from "$lib/components/editor/ProjectsModal.svelte";
    import {
        createBlankProject,
        downloadProjectFile,
    } from "$lib/utils/projectSerializer";

    import * as Command from "$lib/components/ui/command/index.js";

    import { untrack } from "svelte";
    import type { MenuItem, StudioTab, WorkspaceKind } from "$lib/types/editor";
    import {
        GameData,
        ModelData,
        RuntimeData,
        WorldData,
        ScriptData,
    } from "$lib/stores/data.svelte";
    import * as ECS from "$lib/stores/ecs.svelte";

    // ─── Single source of truth ──────────────────────────────────────────
    // ALL game data lives here. Workspaces receive references into this
    // object and modify it directly. Because Svelte 5 $state() is deeply
    // reactive, mutations to nested properties propagate everywhere.
    let gameData = $state(new GameData());
    let runtimeData = $state(new RuntimeData());

    // Keep runtimeData.gameData in sync
    $effect(() => {
        runtimeData.gameData = gameData;
    });

    // ─── Tabs ────────────────────────────────────────────────────────────
    // Each tab references a piece of data by its ID (dataId).
    // When a tab is switched to, we look up the data from gameData.
    let tabs = $state<StudioTab[]>([]);
    let activeTab = $state<string>("");

    /** Find the data object for a given tab. */
    function dataForTab(
        tab: StudioTab,
    ): ModelData | WorldData | ScriptData | undefined {
        if (!tab.dataId) return undefined;
        if (tab.kind === "model")
            return gameData.models.find((m) => m.id === tab.dataId);
        if (tab.kind === "world")
            return gameData.worlds.find(
                (w) => w.id === tab.dataId,
            ) as unknown as WorldData;
        if (tab.kind === "script")
            return gameData.scripts.find((s) => s.id === tab.dataId);
        return undefined;
    }

    /** Get the currently-active workspace data (cast to the right type). */
    function activeModelData(): ModelData | undefined {
        const tab = tabs.find((t) => t.id === activeTab);
        return tab?.kind === "model"
            ? (dataForTab(tab) as ModelData | undefined)
            : undefined;
    }

    function activeWorldData(): WorldData | undefined {
        const tab = tabs.find((t) => t.id === activeTab);
        return tab?.kind === "world"
            ? (dataForTab(tab) as WorldData | undefined)
            : undefined;
    }

    function activeScriptData(): ScriptData | undefined {
        const tab = tabs.find((t) => t.id === activeTab);
        return tab?.kind === "script"
            ? (dataForTab(tab) as ScriptData | undefined)
            : undefined;
    }

    // ─── Tab management ─────────────────────────────────────────────────
    function openModelTab(name: string, modelData: ModelData) {
        // Reuse existing tab if this model is already open
        const existing = tabs.find(
            (t) => t.dataId === modelData.id && t.kind === "model",
        );
        if (existing) {
            activeTab = existing.id;
            return;
        }
        const tab: StudioTab = {
            id: crypto.randomUUID(),
            name,
            kind: "model",
            dirty: false,
            dataId: modelData.id,
        };
        tabs.push(tab);
        activeTab = tab.id;
    }

    function createNewModel(name?: string) {
        const model = new ModelData(name ?? "Untitled Model");
        gameData.models.push(model);
        openModelTab(model.name, model);
    }

    function openScriptTab(name: string, scriptData: ScriptData) {
        const existing = tabs.find(
            (t) => t.dataId === scriptData.id && t.kind === "script",
        );
        if (existing) {
            activeTab = existing.id;
            return;
        }
        const tab: StudioTab = {
            id: crypto.randomUUID(),
            name,
            kind: "script",
            dirty: false,
            dataId: scriptData.id,
        };
        tabs.push(tab);
        activeTab = tab.id;
    }

    function createNewScript(name?: string) {
        const script = new ScriptData(name ?? "Untitled Script");
        gameData.scripts.push(script);
        openScriptTab(script.name, script);
    }

    function openWorldTab(name: string, worldData: WorldData) {
        const existing = tabs.find(
            (t) => t.dataId === worldData.id && t.kind === "world",
        );
        if (existing) {
            activeTab = existing.id;
            return;
        }
        const tab: StudioTab = {
            id: crypto.randomUUID(),
            name,
            kind: "world",
            dirty: false,
            dataId: worldData.id,
        };
        tabs.push(tab);
        activeTab = tab.id;
    }

    function openTestTab() {
        const existing = tabs.find((t) => t.kind === "test");
        if (existing) {
            activeTab = existing.id;
            return;
        }
        const tab: StudioTab = {
            id: crypto.randomUUID(),
            name: "Test Tab",
            kind: "test",
            dirty: false,
            dataId: "",
        };
        tabs.push(tab);
        activeTab = tab.id;
    }


    function createNewWorld(name?: string) {
        const world = new WorldData();
        world.name = name ?? "Untitled World";
        gameData.worlds.push(world);
        openWorldTab(world.name, world);
    }

    // Seed default tabs so there's something to work with
    if (untrack(() => tabs.length === 0)) {
        createNewWorld("Lobby");
        createNewModel("My Model");
        createNewScript("My Script");

        const lobbyWorld = gameData.worlds[0];
        const script = gameData.scripts[0];
        if (lobbyWorld && script) {
            // Ground platform
            const ground = ECS.createPartEntity("Ground");
            const groundTransform = ground.components.find((c) => c.name === "Transform");
            if (groundTransform) {
                groundTransform.data.position.value = { x: 0, y: -0.5, z: 0 };
                groundTransform.data.scale.value = { x: 40, y: 1, z: 40 };
            }
            const groundPhysics = ground.components.find((c) => c.name === "Physics");
            if (groundPhysics) {
                groundPhysics.data.anchored.value = true;
            }
            const groundMesh = ground.components.find((c) => c.name === "Mesh");
            if (groundMesh) {
                groundMesh.data.color.value = 0x1e293b;
            }
            lobbyWorld.entities.push(ground);

            // Player character
            const player = ECS.createPlayerEntity("Player");
            const playerTransform = player.components.find((c) => c.name === "Transform");
            if (playerTransform) {
                playerTransform.data.position.value = { x: 0, y: 1.5, z: 0 };
            }
            lobbyWorld.entities.push(player);

            // Follow camera
            const cameraEntity = ECS.createCameraEntity("Follow Camera");
            const camComp = cameraEntity.components.find((c) => c.name === "Camera");
            if (camComp) {
                camComp.data.active.value = true;
                camComp.data.mode.value = "follow";
            }
            lobbyWorld.entities.push(cameraEntity);

            const part = ECS.createPartEntity("Interactive Part");
            const partTransform = part.components.find((c) => c.name === "Transform");
            if (partTransform) {
                partTransform.data.position.value = { x: 4, y: 1, z: 0 };
            }
            const scriptComp = ECS.createScriptComponent(script.id);
            part.components.push(scriptComp);
            lobbyWorld.entities.push(part);

            const uiButton = ECS.createUIEntity("UIButton 1", "button");
            lobbyWorld.entities.push(uiButton);
        }

        openTestTab();
    }

    // ─── Projects & Persistence ──────────────────────────────────────────
    let projectsModalOpen = $state(true); // Open on first visit
    let hasStarted = $state(false);

    function handleNewProject() {
        gameData = createBlankProject();
        tabs = [];
        if (gameData.worlds.length > 0) {
            openWorldTab(gameData.worlds[0].name, gameData.worlds[0]);
        }
        if (gameData.scripts.length > 0) {
            openScriptTab(gameData.scripts[0].name, gameData.scripts[0]);
        }
        openTestTab();
        hasStarted = true;
        triggerSave();
    }

    function handleLoadProject(newGameData: GameData) {
        gameData = newGameData;
        tabs = [];
        if (gameData.worlds.length > 0) {
            openWorldTab(gameData.worlds[0].name, gameData.worlds[0]);
        }
        if (gameData.scripts.length > 0) {
            openScriptTab(gameData.scripts[0].name, gameData.scripts[0]);
        }
        if (gameData.models.length > 0) {
            openModelTab(gameData.models[0].name, gameData.models[0]);
        }
        openTestTab();
        hasStarted = true;
        triggerSave();
    }

    function handleSaveProject() {
        downloadProjectFile(gameData);
        triggerSave();
    }

    // ─── Save ────────────────────────────────────────────────────────────
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

    // ─── Menu config ─────────────────────────────────────────────────────
    const menus: Record<string, MenuItem[]> = {
        File: [
            { label: "Projects…", action: () => (projectsModalOpen = true) },
            { separator: true },
            { label: "New World", shortcut: "Ctrl+N", action: () => createNewWorld() },
            { label: "New Model", shortcut: "Ctrl+M", action: () => createNewModel() },
            { label: "Open Project…", shortcut: "Ctrl+O", action: () => (projectsModalOpen = true) },
            { separator: true },
            { label: "Save Project", shortcut: "Ctrl+S", action: () => handleSaveProject() },
            { label: "Save As…", shortcut: "Ctrl+Shift+S", action: () => handleSaveProject() },
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

    let activeWorkspace = $state<WorkspaceKind>("model");

    // ─── Sync activeWorkspace ↔ activeTab ─────────────────────────────────
    // Each effect uses untrack() to read the "other" variable without
    // creating a circular dependency. Without untrack, clicking a tab
    // triggers Effect A → changes activeWorkspace → triggers Effect B
    // → overwrites activeTab to the WRONG tab.

    // Tab click → update workspace to match the tab's kind
    $effect(() => {
        const tab = tabs.find((t) => t.id === activeTab);
        if (tab && tab.kind !== untrack(() => activeWorkspace)) {
            activeWorkspace = tab.kind;
        }
    });

    // Menu workspace change → find or create a tab of that kind
    $effect(() => {
        const ws = activeWorkspace;
        const currentTab = untrack(() => tabs.find((t) => t.id === activeTab));
        if (currentTab && currentTab.kind === ws) return; // already on right tab

        const tab = untrack(() => tabs.find((t) => t.kind === ws));
        if (tab) {
            activeTab = tab.id;
        } else {
            if (ws === "model") createNewModel();
            else if (ws === "world") createNewWorld();
            else if (ws === "script") createNewScript();
        }
    });

    function switchWorkspace(kind: WorkspaceKind) {
        activeWorkspace = kind;
        // Find an existing tab of this kind, or create one
        const existing = tabs.find((t) => t.kind === kind);
        if (existing) {
            activeTab = existing.id;
        } else {
            // Create a new tab of the right kind
            if (kind === "model") createNewModel();
            else if (kind === "world") createNewWorld();
            else if (kind === "script") createNewScript();
            else if (kind === "test") openTestTab();
        }
    }


    let addTabTypeModalOpen = $state(false);
    let addTabDataModalOpen = $state(false);
    let addTabDataSearchModel = $state("");
    let addScriptDataModalOpen = $state(false);
    let addScriptDataSearch = $state("");

    function handleKeydown(e: KeyboardEvent) {
        // Don't trigger shortcuts when typing in inputs
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") return;

        if (e.key === "o" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            addTabTypeModalOpen = !addTabTypeModalOpen;
        }
    }

    function handleTabTypeSelect(type: "World" | "Model" | "Script") {
        addTabTypeModalOpen = false;

        if (type === "Model") {
            addTabDataModalOpen = true;
        } else if (type === "Script") {
            addScriptDataModalOpen = true;
        } else {
            alert("not supported rn :(");
        }
    }
</script>

<svelte:document onkeydown={handleKeydown} />

<Command.Dialog bind:open={addTabTypeModalOpen} class="rounded-xl p-5">
    <Command.Input placeholder="Search for a tab type..." />
    <Command.List class="mt-3">
        <Command.Empty>No results found.</Command.Empty>
        <Command.Group heading="Tabs">
            <Command.Item onSelect={() => handleTabTypeSelect("World")}>
                World
            </Command.Item>
            <Command.Item onSelect={() => handleTabTypeSelect("Model")}>
                Model
            </Command.Item>
            <Command.Item onSelect={() => handleTabTypeSelect("Script")}>
                Script
            </Command.Item>
        </Command.Group>
    </Command.List>
</Command.Dialog>

<Command.Dialog bind:open={addTabDataModalOpen} class="rounded-xl p-5">
    <Command.Input
        bind:value={addTabDataSearchModel}
        placeholder="Search for a file..."
    />
    <Command.List class="mt-3">
        <Command.Empty>No results found.</Command.Empty>
        <Command.Group heading="Actions" forceMount={true}>
            <Command.Item
                forceMount={true}
                onSelect={() => {
                    createNewModel(addTabDataSearchModel);
                    addTabDataModalOpen = false;
                }}
            >
                Create New Model {addTabDataSearchModel
                    ? `(${addTabDataSearchModel})`
                    : ""}
            </Command.Item>
        </Command.Group>
        <Command.Separator />
        <Command.Group heading="Existing Models">
            {#each gameData.models as model}
                <Command.Item
                    onSelect={() => {
                        openModelTab(model.name, model);
                        addTabDataModalOpen = false;
                    }}
                >
                    {model.name}
                </Command.Item>
            {/each}
        </Command.Group>
    </Command.List>
</Command.Dialog>

<Command.Dialog bind:open={addScriptDataModalOpen} class="rounded-xl p-5">
    <Command.Input
        bind:value={addScriptDataSearch}
        placeholder="Search for a script..."
    />
    <Command.List class="mt-3">
        <Command.Empty>No results found.</Command.Empty>
        <Command.Group heading="Actions" forceMount={true}>
            <Command.Item
                forceMount={true}
                onSelect={() => {
                    createNewScript(addScriptDataSearch);
                    addScriptDataModalOpen = false;
                }}
            >
                Create New Script {addScriptDataSearch
                    ? `(${addScriptDataSearch})`
                    : ""}
            </Command.Item>
        </Command.Group>
        <Command.Separator />
        <Command.Group heading="Existing Scripts">
            {#each gameData.scripts as script}
                <Command.Item
                    onSelect={() => {
                        openScriptTab(script.name, script);
                        addScriptDataModalOpen = false;
                    }}
                >
                    {script.name}
                </Command.Item>
            {/each}
        </Command.Group>
    </Command.List>
</Command.Dialog>

<SplashScreen />

<ProjectsModal
    bind:open={projectsModalOpen}
    bind:hasStarted
    {gameData}
    onNewProject={handleNewProject}
    onLoadProject={handleLoadProject}
    onSaveProject={handleSaveProject}
/>

<div class="flex h-dvh flex-col">
    <MenuBar
        {menus}
        bind:activeWorkspace
        {saved}
        {saving}
        onsave={handleSaveProject}
        onplay={() => switchWorkspace("test")}
        onopenprojects={() => (projectsModalOpen = true)}
    />


    <TabBar
        bind:tabs
        bind:activeTab
        createTab={() => {
            addTabTypeModalOpen = true;
        }}
    />

    {#if activeWorkspace === "world"}
        {@const worldData = activeWorldData()}
        {#if worldData}
            <WorldWorkspace {worldData} {gameData} />
        {:else}
            <div
                class="flex h-full items-center justify-center text-muted-foreground"
            >
                <p>No world selected. Open a world tab to start editing.</p>
            </div>
        {/if}
    {:else if activeWorkspace === "model"}
        {@const modelData = activeModelData()}
        {#if modelData}
            <ModelWorkspace {modelData} {gameData} />
        {:else}
            <div
                class="flex h-full items-center justify-center text-muted-foreground"
            >
                <p>No model selected. Open a model tab to start editing.</p>
            </div>
        {/if}
    {:else if activeWorkspace === "script"}
        {@const scriptData = activeScriptData()}
        {#if scriptData}
            <ScriptWorkspace
                {scriptData}
                {gameData}
                openScript={(s) => openScriptTab(s.name, s)}
                onNewScript={() => createNewScript()}
            />
        {:else}
            <div
                class="flex h-full items-center justify-center text-muted-foreground"
            >
                <p>No script selected. Open a script tab to start editing.</p>
            </div>
        {/if}
    {:else if activeWorkspace === "test"}
        <RuntimeWorkspace {runtimeData} />
    {/if}
</div>
