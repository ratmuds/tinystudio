import * as ECS from "$lib/stores/ecs";

class GameData {
    name: string = "Untitled Game";
    description: string = "";

    components: ECS.Component[] = []; // User-defined components in game
    systems: ECS.System[] = []; // User-defined systems in game

    worlds: WorkspaceData[] = []; // Data of the words. During runtime, only one world is active at a time and data is copied from data to runtime data
}

type WorkspaceKind = "world" | "model" | "script";

class WorkspaceData {
    id: string;
    type: WorkspaceKind;

    constructor(id: string, type: WorkspaceKind) {
        this.id = id;
        this.type = type;
    }
}

class WorldData {
    id: string;
    name: string;

    entities: ECS.Entity[] = [];
}

class WorldWorkspaceData extends WorkspaceData {
    id: string;

    worldData: WorldData;

    // If faces are being selected, the entities and faces list will be matched by index, so if two faces of the same entity are selected, the entity ID will appear twice in the list, and the face IDs will be in the same order as the entity IDs.
    // Selected faces only apply to entities with the mesh component (or base entity of part)
    selectedEntities: string[] = []; // List of selected entity IDs
    selectedFaces: string[] = []; // List of selected face IDs

    constructor(id: string) {
        super(id, "world");
    }
}
