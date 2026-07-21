import * as ECS from "$lib/stores/ecs";

export class GameData {
    name: string = "Untitled Game";
    description: string = "";

    components: ECS.Component[] = []; // User-defined components in game
    systems: ECS.System[] = []; // User-defined systems in game

    worlds: WorldData[] = []; // All worlds in this game
    models: ModelData[] = []; // All models in the game (reusable across worlds)
}

export type WorkspaceKind = "world" | "model" | "script";

export class WorkspaceData {
    id: string;
    type: WorkspaceKind;

    constructor(id: string, type: WorkspaceKind) {
        this.id = id;
        this.type = type;
    }
}

export class WorldData {
    id: string = crypto.randomUUID();
    name: string = "Untitled World";

    entities: ECS.Entity[] = [];
}

export class WorldWorkspaceData extends WorkspaceData {
    worldData: WorldData;

    // If faces are being selected, the entities and faces list will be matched by index, so if two faces of the same entity are selected, the entity ID will appear twice in the list, and the face IDs will be in the same order as the entity IDs.
    // Selected faces only apply to entities with the mesh component (or base entity of part)
    selectedEntities: string[] = []; // List of selected entity IDs
    selectedFaces: string[] = []; // List of selected face IDs

    constructor(worldData?: WorldData, id?: string) {
        super(id || crypto.randomUUID(), "world");
        this.worldData = worldData || new WorldData();
    }
}

export class ModelData {
    id: string;
    name: string;

    entities: ECS.Entity[] = [];

    constructor(name: string, id?: string) {
        this.id = id || crypto.randomUUID();
        this.name = name;
    }
}

export class ModelWorkspaceData extends WorkspaceData {
    modelData: ModelData;

    constructor(modelData: ModelData, id?: string) {
        super(id || crypto.randomUUID(), "model");
        this.modelData = modelData;
    }
}