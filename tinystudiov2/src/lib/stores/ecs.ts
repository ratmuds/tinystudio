type BaseEntityType = "part" | "model" | "light" | "camera" | "custom";

class Entity {
    id!: string;
    name!: string;
    baseEntity!: BaseEntityType; // The base entity type determines the default components and behavior of the entity

    components: Component[] = [];

    children: Entity[] = [];
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
};

class Component {
    id!: string;
    name!: string;
    tooltip?: string;

    data: Record<string, ComponentDataEntry> = {};
}

class System {
    id!: string;
    name!: string;
    tooltip?: string;

    relatedComponents: string[] = [];

    // The update function is called every frame with the delta time and the list of entities in the world.
    update(deltaTime: number, entities: Entity[]): void {}
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
        collisionShape: makeEntry(
            "string",
            "box",
            "Shape used for collision: box, sphere, or convexHull",
        ),
        mass: makeEntry("number", 1, "Mass in kg. 0 = static/immovable"),
        friction: makeEntry(
            "number",
            0.5,
            "Surface friction (0 = ice, 1 = rubber)",
        ),
        restitution: makeEntry(
            "number",
            0.3,
            "Bounciness (0 = no bounce, 1 = perfect bounce)",
        ),
        isKinematic: makeEntry(
            "boolean",
            false,
            "Kinematic objects move by script, not forces",
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
    // factories
    createTransformComponent,
    createMeshComponent,
    createPhysicsComponent,
    createModelRefComponent,
    createPartEntity,
};
