import type * as ECS from "$lib/stores/ecs.svelte";

export class GameData {
    name: string = $state("Untitled Game");
    description: string = $state("");

    components: ECS.Component[] = $state([]); // User-defined components in game
    systems: ECS.System[] = $state([]); // User-defined systems in game

    worlds: WorldData[] = $state([]); // All worlds in this game
    models: ModelData[] = $state([]); // All models in the game (reusable across worlds)
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
}

export class ModelWorkspaceData extends WorkspaceData {
    modelData: ModelData = $state(new ModelData(""));

    constructor(modelData: ModelData, id?: string) {
        super(id || crypto.randomUUID(), "model");
        this.modelData = modelData;
    }
}
