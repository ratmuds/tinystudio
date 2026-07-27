type BaseEntityType = "part" | "model" | "light" | "camera" | "custom";

class Entity {
    id: string = $state("");
    name: string = $state("");
    baseEntity: BaseEntityType = $state("part"); // The base entity type determines the default components and behavior of the entity

    components: Component[] = $state([]);

    children: Entity[] = $state([]);
}

type ComponentDataEntry = {
    type:
        | "string"
        | "number"
        | "boolean"
        | "vector3"
        | "color"
        | "texture"
        | "entity"
        | "model"
        | "script";
    defaultValue: any;
    value: any;

    tooltip?: string;
    dirty: boolean;
};

class Component {
    id: string = $state("");
    name: string = $state("");
    tooltip?: string = $state();

    data: Record<string, ComponentDataEntry> = $state({});
}

class System {
    id: string = $state("");
    name: string = $state("");
    tooltip?: string = $state();

    relatedComponents: string[] = $state([]);
    systemData: any = $state({});

    // Called once when the runtime starts. Use this to initialize resources.
    setup(_entities: Entity[]): void {}

    // Called every frame with the delta time and the list of entities in the world.
    update(_deltaTime: number, _entities: Entity[]): void {}

    // Called once when the runtime stops. Use this to clean up resources.
    cleanup(): void {}
}

// Component Factories //

function makeEntry(
    type: ComponentDataEntry["type"],
    defaultValue: any,
    tooltip?: string,
): ComponentDataEntry {
    return {
        type,
        defaultValue: structuredClone(defaultValue),
        value: structuredClone(defaultValue),
        tooltip,
        dirty: false,
    };
}

function createTransformComponent(): Component {
    const c = new Component();
    c.id = crypto.randomUUID();
    c.name = "Transform";
    c.tooltip = "Position, rotation, and scale of the entity in 3D space.";
    c.data = {
        position: makeEntry("vector3", { x: 0, y: 0, z: 0 }, "Local position"),
        rotation: makeEntry(
            "vector3",
            { x: 0, y: 0, z: 0 },
            "Euler rotation in degrees",
        ),
        scale: makeEntry("vector3", { x: 1, y: 1, z: 1 }, "Local scale"),
    };
    return c;
}

function createMeshComponent(): Component {
    const c = new Component();
    c.id = crypto.randomUUID();
    c.name = "Mesh";
    c.tooltip = "Defines the visible 3D geometry of this entity.";
    c.data = {
        geometryType: makeEntry(
            "string",
            "box",
            "Shape: box, sphere, cylinder, or wedge",
        ),
        size: makeEntry(
            "vector3",
            { x: 1, y: 1, z: 1 },
            "Dimensions of the mesh",
        ),
        color: makeEntry("color", 0x44aa44, "Base color of the mesh"),
    };
    return c;
}

function createPhysicsComponent(): Component {
    const c = new Component();
    c.id = crypto.randomUUID();
    c.name = "Physics";
    c.tooltip =
        "Defines how this entity interacts with the physics simulation.";
    c.data = {
        enabled: makeEntry(
            "boolean",
            true,
            "Whether the physics simulation is enabled for this entity",
        ),
        anchored: makeEntry(
            "boolean",
            false,
            "Whether the entity is anchored in place and does not move",
        ),
        customCollider: makeEntry(
            "model",
            "",
            "Optional custom collider model ID",
        ),
    };
    return c;
}

function createModelRefComponent(modelId: string): Component {
    const c = new Component();
    c.id = crypto.randomUUID();
    c.name = "ModelRef";
    c.tooltip =
        "References a model by ID. The entity renders as an instance of that model.";
    c.data = {
        modelId: makeEntry(
            "string",
            modelId,
            "ID of the model in gameData.models[]",
        ),
    };
    return c;
}

function clearDirtyFlags(entities: Entity[]): void {
    for (const entity of entities) {
        for (const component of entity.components) {
            for (const key in component.data) {
                component.data[key].dirty = false;
            }
        }
    }
}

// ─── Entity Factories ───────────────────────────────────────────────────
// Each factory returns an Entity pre-populated with the default components
// for that baseEntity type.

function createPartEntity(name: string = "Part"): Entity {
    const e = new Entity();
    e.id = crypto.randomUUID();
    e.name = name;
    e.baseEntity = "part";
    e.components = [
        createTransformComponent(),
        createMeshComponent(),
        createPhysicsComponent(),
    ];
    return e;
}

export {
    type BaseEntityType,
    Entity,
    Component,
    System,
    type ComponentDataEntry,
    // utilities
    clearDirtyFlags,
    // factories
    createTransformComponent,
    createMeshComponent,
    createPhysicsComponent,
    createModelRefComponent,
    createPartEntity,
};
