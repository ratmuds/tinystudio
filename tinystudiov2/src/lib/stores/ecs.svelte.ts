import { EventEmitter } from "$lib/stores/EventEmitter";

type BaseEntityType =
    | "part"
    | "model"
    | "light"
    | "camera"
    | "constraint"
    | "custom"
    | "ui"
    | "player";

class Entity {
    id: string = $state("");
    name: string = $state("");
    baseEntity: BaseEntityType = $state("part"); // The base entity type determines the default components and behavior of the entity

    components: Component[] = $state([]);
    children: Entity[] = $state([]);
    tags: string[] = $state([]);
    events: EventEmitter = new EventEmitter();
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
        | "script"
        | "json"
        | "jsonList";
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
        customGeometry: makeEntry(
            "json",
            null,
            "Serialized custom geometry (positions + index). Overrides primitive geometryType.",
        ),
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
        mass: makeEntry(
            "number",
            1,
            "Mass of the rigid body in kg",
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

function createScriptComponent(scriptId: string = ""): Component {
    const c = new Component();
    c.id = crypto.randomUUID();
    c.name = "Script";
    c.tooltip =
        "Attaches a script to this entity. Holds per-instance stateData (JSON object) and scriptData (JSON list of blocks, each with a `code` field).";
    c.data = {
        scriptId: makeEntry(
            "script",
            scriptId,
            "ID of the authored script in gameData.scripts[] to attach",
        ),
        stateData: makeEntry("json", {}, "Per-instance state (JSON object)"),
        scriptData: makeEntry(
            "jsonList",
            [{ code: "" }],
            "Per-instance script blocks (JSON list; each block has a `code` field)",
        ),
    };
    return c;
}

function createConstraintComponent(): Component {
    const c = new Component();
    c.id = crypto.randomUUID();
    c.name = "Constraint";
    c.tooltip = "Defines a physics constraint between two entities.";
    c.data = {
        entityA: makeEntry("string", "", "ID of the first entity"),
        entityB: makeEntry("string", "", "ID of the second entity"),
        localPosA: makeEntry(
            "vector3",
            { x: 0, y: 0, z: 0 },
            "Attachment point in entity A's local space",
        ),
        localPosB: makeEntry(
            "vector3",
            { x: 0, y: 0, z: 0 },
            "Attachment point in entity B's local space",
        ),
        constraintType: makeEntry(
            "string",
            "fixed",
            "Type: fixed, hinge, ballSocket",
        ),
        axisA: makeEntry(
            "vector3",
            { x: 0, y: 1, z: 0 },
            "Hinge axis in entity A's local space",
        ),
        axisB: makeEntry(
            "vector3",
            { x: 0, y: 1, z: 0 },
            "Hinge axis in entity B's local space",
        ),
        limitsEnabled: makeEntry(
            "boolean",
            false,
            "Whether angular limits are enabled",
        ),
        limitMin: makeEntry("number", -180, "Minimum angle in degrees"),
        limitMax: makeEntry("number", 180, "Maximum angle in degrees"),
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

//  Entity Factories 
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
    e.events = new EventEmitter();
    return e;
}

function createConstraintEntity(name: string = "Constraint"): Entity {
    const e = new Entity();
    e.id = crypto.randomUUID();
    e.name = name;
    e.baseEntity = "constraint";
    e.components = [createConstraintComponent()];
    return e;
}

function createCameraComponent(): Component {
    const c = new Component();
    c.id = crypto.randomUUID();
    c.name = "Camera";
    c.tooltip =
        "Controls the active viewport camera. mode: fixed, orbit (around target), firstPerson (FPS), or fly (free flight).";
    c.data = {
        active: makeEntry(
            "boolean",
            false,
            "Whether this is the active camera in play mode",
        ),
        mode: makeEntry(
            "string",
            "orbit",
            "Camera mode: fixed, orbit, firstPerson, or fly",
        ),
        fov: makeEntry("number", 75, "Vertical field of view in degrees"),
        target: makeEntry(
            "vector3",
            { x: 0, y: 0, z: 0 },
            "Look-at point (fixed/orbit) or initial view direction (firstPerson)",
        ),
        distance: makeEntry(
            "number",
            8,
            "Orbit distance from target",
        ),
        yaw: makeEntry("number", 0, "Orbit yaw in radians"),
        pitch: makeEntry("number", 0, "Orbit pitch in radians"),
        moveSpeed: makeEntry(
            "number",
            8,
            "firstPerson/fly movement speed",
        ),
    };
    return c;
}

function createCameraEntity(name: string = "Camera"): Entity {
    const e = new Entity();
    e.id = crypto.randomUUID();
    e.name = name;
    e.baseEntity = "camera";
    e.components = [createTransformComponent(), createCameraComponent()];
    e.events = new EventEmitter();
    return e;
}

function createUIComponent(type: "button" | "text" = "button"): Component {
    const c = new Component();
    c.id = crypto.randomUUID();
    c.name = "UI";
    c.tooltip = "Screen UI element rendered directly over the game viewport";
    c.data = {
        type: makeEntry("string", type, "UI element type: button or text"),
        text: makeEntry("string", type === "button" ? "Click Me" : "Sample Text", "Displayed text"),
        x: makeEntry("number", 20, "X position in pixels from the left"),
        y: makeEntry("number", 20, "Y position in pixels from the top"),
        width: makeEntry("number", type === "button" ? 120 : 200, "Width in pixels"),
        height: makeEntry("number", type === "button" ? 40 : 32, "Height in pixels"),
        color: makeEntry("color", "#ffffff", "Text color"),
        backgroundColor: makeEntry("color", type === "button" ? "#22c55e" : "#1c1c1c", "Background color"),
        fontSize: makeEntry("number", 14, "Font size in pixels"),
        visible: makeEntry("boolean", true, "Whether this UI element is visible"),
    };
    return c;
}

function createUIEntity(name: string = "UI Element", type: "button" | "text" = "button"): Entity {
    const e = new Entity();
    e.id = crypto.randomUUID();
    e.name = name;
    e.baseEntity = "ui";
    e.components = [createUIComponent(type)];
    e.events = new EventEmitter();
    return e;
}

function createPlayerControllerComponent(): Component {
    const c = new Component();
    c.id = crypto.randomUUID();
    c.name = "PlayerController";
    c.tooltip = "Keyboard movement and jump controller for playable entities";
    c.data = {
        speed: makeEntry("number", 8, "Movement speed in units per second"),
        jumpForce: makeEntry("number", 9, "Upward jump impulse velocity"),
        airControl: makeEntry("number", 0.6, "Air movement multiplier while jumping"),
        enabled: makeEntry("boolean", true, "Whether player input controls this entity"),
    };
    return c;
}

function createPlayerEntity(name: string = "Player"): Entity {
    const e = new Entity();
    e.id = crypto.randomUUID();
    e.name = name;
    e.baseEntity = "player";

    // Transform (centered, slightly elevated)
    const transform = createTransformComponent();
    transform.data.position.value = { x: 0, y: 1.5, z: 0 };

    // Mesh: Cyan/Blue Player Avatar Cylinder
    const mesh = createMeshComponent();
    mesh.data.geometryType.value = "cylinder";
    mesh.data.size.value = { x: 0.8, y: 1.8, z: 0.8 };
    mesh.data.color.value = 0x0ea5e9; // Vibrant sky-blue avatar

    // Physics: dynamic body with mass
    const physics = createPhysicsComponent();
    if (physics.data.anchored) physics.data.anchored.value = false;
    if (physics.data.mass) physics.data.mass.value = 70;

    // PlayerController
    const controller = createPlayerControllerComponent();

    e.components = [transform, mesh, physics, controller];
    e.events = new EventEmitter();
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
    createScriptComponent,
    createPartEntity,
    createConstraintEntity,
    createCameraComponent,
    createCameraEntity,
    createUIComponent,
    createUIEntity,
    createPlayerControllerComponent,
    createPlayerEntity,
};
