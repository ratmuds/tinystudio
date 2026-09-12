import type * as ECS from "$lib/stores/ecs.svelte";

export class GameData {
    name: string = $state("Untitled Game");
    description: string = $state("");

    components: ECS.Component[] = $state([]); // User-defined components in game
    systems: ECS.System[] = $state([]); // User-defined systems in game

    worlds: WorldData[] = $state([]); // All worlds in this game
    models: ModelData[] = $state([]); // All models in the game (reusable across worlds)
    scripts: ScriptData[] = $state([]); // All scripts in the game (reusable across entities)

    toJSON() {
        return {
            name: this.name,
            description: this.description,
            components: this.components,
            systems: this.systems,
            worlds: this.worlds,
            models: this.models,
            scripts: this.scripts,
        };
    }
}

export class RuntimeData {
    gameData: GameData = $state(new GameData());
    runtimeGameData: GameData = $state(new GameData()); // Runtime copy of game data, used for running the game

    systems: ECS.System[] = $state([]); // Systems currently running in the runtime
}

export type WorkspaceKind = "world" | "model" | "script";

export class WorkspaceData {
    id: string = $state("");
    type: WorkspaceKind = $state("world");

    constructor(id: string, type: WorkspaceKind) {
        this.id = id;
        this.type = type;
    }
}

export class WorldData {
    id: string = $state(crypto.randomUUID());
    name: string = $state("Untitled World");

    entities: ECS.Entity[] = $state([]);

    toJSON() {
        return {
            id: this.id,
            name: this.name,
            entities: this.entities,
        };
    }
}

export class WorldWorkspaceData extends WorkspaceData {
    worldData: WorldData = $state(new WorldData());

    // If faces are being selected, the entities and faces list will be matched by index, so if two faces of the same entity are selected, the entity ID will appear twice in the list, and the face IDs will be in the same order as the entity IDs.
    // Selected faces only apply to entities with the mesh component (or base entity of part)
    selectedEntities: string[] = $state([]); // List of selected entity IDs
    selectedFaces: string[] = $state([]); // List of selected face IDs

    constructor(worldData?: WorldData, id?: string) {
        super(id || crypto.randomUUID(), "world");
        this.worldData = worldData || new WorldData();
    }
}

export class ModelData {
    id: string = $state("");
    name: string = $state("");
    thumbnail: string = $state(""); // Base64-encoded PNG thumbnail of model

    entities: ECS.Entity[] = $state([]);

    constructor(name: string, id?: string) {
        this.id = id || crypto.randomUUID();
        this.name = name;
    }

    toJSON() {
        return {
            id: this.id,
            name: this.name,
            thumbnail: this.thumbnail,
            entities: this.entities,
        };
    }
}

export class ModelWorkspaceData extends WorkspaceData {
    modelData: ModelData = $state(new ModelData(""));

    constructor(modelData: ModelData, id?: string) {
        super(id || crypto.randomUUID(), "model");
        this.modelData = modelData;
    }
}

export class ScriptData {
    id: string = $state("");
    name: string = $state("");

    // JSON object describing the default/initial state shape of the script.
    stateData: any = $state({});
    // JSON list of script blocks. Each block is an object with at least a
    // `code` field holding the Luau source. Stored as JSON so additional
    // metadata (language, enabled, etc.) can be added per-block later.
    scriptData: any[] = $state([
        {
            code: `-- Welcome to TinyStudio!
-- 'this' (or 'entity') is automatically bound to this entity.
-- 'Transform', 'Physics', 'UI', 'Input', and 'wait()' are globally available.

print("Starting script on:", entity and entity.name or "World")

-- Example: Listen to UI button click
UI.onClick("UIButton 1", function()
    print("UI Button was clicked!")
    UI.setText("UIButton 1", "Clicked!")
end)

-- Example game loop
local count = 0
while true do
    wait(1)
    count = count + 1
    print("Seconds active:", count)

    -- If this entity has a Transform, gently spin it
    if Transform then
        Transform.rotation.y = Transform.rotation.y + 0.1
    end
end`,
        },
    ]);

    constructor(name: string, id?: string) {
        this.id = id || crypto.randomUUID();
        this.name = name;
    }

    toJSON() {
        return {
            id: this.id,
            name: this.name,
            stateData: this.stateData,
            scriptData: this.scriptData,
        };
    }
}

export class ScriptWorkspaceData extends WorkspaceData {
    scriptData: ScriptData = $state(new ScriptData(""));

    constructor(scriptData: ScriptData, id?: string) {
        super(id || crypto.randomUUID(), "script");
        this.scriptData = scriptData;
    }
}
