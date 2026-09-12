import { GameData, WorldData, ModelData, ScriptData } from "$lib/stores/data.svelte";
import {
    Entity,
    Component,
    createComponent,
    createPartEntity,
    createPlayerEntity,
    createCameraEntity,
    type ComponentDataEntry,
} from "$lib/stores/ecs.svelte";
import { EventEmitter } from "$lib/stores/EventEmitter";

export interface DemoProjectInfo {
    id: string;
    name: string;
    description: string;
    filename: string;
    icon: "gamepad" | "boxes" | "sparkles";
    tags: string[];
    data?: any;
}

/**
 * Normalizes component data types so they strictly match the
 * expected types in ecs.svelte.ts and editor UI components.
 */
export function normalizeComponentDataType(
    rawType: any,
): ComponentDataEntry["type"] | undefined {
    if (!rawType || typeof rawType !== "string") return undefined;
    const lower = rawType.toLowerCase().trim();
    if (lower === "vec3" || lower === "vector3") return "vector3";
    if (lower === "bool" || lower === "boolean") return "boolean";
    if (lower === "int" || lower === "float" || lower === "number") return "number";
    if (lower === "str" || lower === "string") return "string";
    if (lower === "color" || lower === "colour") return "color";
    if (lower === "texture") return "texture";
    if (lower === "entity") return "entity";
    if (lower === "model") return "model";
    if (lower === "script") return "script";
    if (lower === "json") return "json";
    if (lower === "jsonlist") return "jsonList";
    return undefined;
}

/**
 * Normalizes vector3 values from objects or arrays: {x, y, z} or [x, y, z]
 */
function normalizeVector3Value(val: any): { x: number; y: number; z: number } {
    if (Array.isArray(val)) {
        return {
            x: Number(val[0]) || 0,
            y: Number(val[1]) || 0,
            z: Number(val[2]) || 0,
        };
    }
    if (val && typeof val === "object") {
        return {
            x: Number(val.x) || 0,
            y: Number(val.y) || 0,
            z: Number(val.z) || 0,
        };
    }
    return { x: 0, y: 0, z: 0 };
}

/**
 * Strips reactive proxies and formats plain JSON-safe objects.
 */
export function cleanValue(val: any): any {
    if (val === undefined || val === null) return val;
    if (typeof val !== "object") return val;
    if (Array.isArray(val)) return val.map(cleanValue);
    if ("x" in val && "y" in val) {
        const res: any = {
            x: Number(val.x) || 0,
            y: Number(val.y) || 0,
        };
        if ("z" in val) res.z = Number(val.z) || 0;
        if ("w" in val) res.w = Number(val.w) || 0;
        return res;
    }
    const copy: Record<string, any> = {};
    for (const [k, v] of Object.entries(val)) {
        copy[k] = cleanValue(v);
    }
    return copy;
}

/**
 * Merge an incoming component property entry into a Component's data map.
 */
function restoreComponentEntry(
    comp: Component,
    key: string,
    rawEntry: any,
): void {
    if (rawEntry === undefined) return;

    let val: any;
    let type: ComponentDataEntry["type"] | undefined;
    let defaultValue: any;
    let tooltip = "";

    if (rawEntry !== null && typeof rawEntry === "object" && "value" in rawEntry) {
        val = rawEntry.value;
        type = normalizeComponentDataType(rawEntry.type);
        defaultValue =
            rawEntry.defaultValue !== undefined ? rawEntry.defaultValue : val;
        tooltip = rawEntry.tooltip || "";
    } else {
        val = rawEntry;
        defaultValue = rawEntry;
    }

    const existing = comp.data[key];

    const finalType: ComponentDataEntry["type"] =
        type ||
        existing?.type ||
        (val && typeof val === "object" && !Array.isArray(val) && ("x" in val || "y" in val)
            ? "vector3"
            : typeof val === "boolean"
            ? "boolean"
            : typeof val === "number"
            ? "number"
            : typeof val === "string"
            ? "string"
            : Array.isArray(val)
            ? "jsonList"
            : "json");

    let finalValue = val;
    if (finalType === "vector3") {
        finalValue = normalizeVector3Value(val);
    }

    if (existing) {
        existing.type = finalType;
        existing.value = finalValue;
        if (defaultValue !== undefined) existing.defaultValue = defaultValue;
        if (tooltip) existing.tooltip = tooltip;
        existing.dirty = true;
    } else {
        comp.data[key] = {
            type: finalType,
            defaultValue: defaultValue !== undefined ? defaultValue : finalValue,
            value: finalValue,
            tooltip: tooltip || "",
            dirty: true,
        };
    }
}

/**
 * Ensures required base components for known baseEntity types exist.
 */
function ensureBaseComponents(
    baseEntity: string,
    components: Component[],
    compNamesSeen: Set<string>,
): void {
    const required: string[] = [];
    if (baseEntity === "part") {
        required.push("Transform", "Mesh", "Physics");
    } else if (baseEntity === "camera") {
        required.push("Transform", "Camera");
    } else if (baseEntity === "player") {
        required.push("Transform", "Mesh", "Physics", "PlayerController");
    } else if (baseEntity === "constraint") {
        required.push("Constraint");
    } else if (baseEntity === "ui") {
        required.push("UI");
    }

    for (const req of required) {
        if (!compNamesSeen.has(req)) {
            const comp = createComponent(req);
            components.push(comp);
            compNamesSeen.add(req);
        }
    }
}

/**
 * Restore an entity from raw JSON data with a fresh EventEmitter,
 * complete component structure with standard defaults, and normalized types.
 */
export function restoreEntity(rawEntity: any): Entity {
    const entity = new Entity();
    entity.id = rawEntity.id || crypto.randomUUID();
    entity.name = rawEntity.name || "Entity";
    entity.baseEntity = rawEntity.baseEntity || "part";
    entity.tags = Array.isArray(rawEntity.tags) ? [...rawEntity.tags] : [];
    entity.events = new EventEmitter();

    const restoredComponents: Component[] = [];
    const compNamesSeen = new Set<string>();

    for (const rawComp of rawEntity.components || []) {
        if (!rawComp) continue;
        const compName = rawComp.name || "Custom";
        compNamesSeen.add(compName);

        // Start from standard component factory to get complete defaults
        const comp = createComponent(compName);
        if (rawComp.id) comp.id = rawComp.id;
        if (rawComp.tooltip !== undefined) comp.tooltip = rawComp.tooltip;

        if (rawComp.data && typeof rawComp.data === "object") {
            for (const [key, rawEntry] of Object.entries(rawComp.data)) {
                restoreComponentEntry(comp, key, rawEntry);
            }
        }

        restoredComponents.push(comp);
    }

    // Ensure essential components exist for baseEntity
    ensureBaseComponents(entity.baseEntity, restoredComponents, compNamesSeen);

    entity.components = restoredComponents;
    entity.children = (rawEntity.children || []).map(restoreEntity);

    return entity;
}

/**
 * Restore a WorldData from raw JSON data.
 */
export function restoreWorld(rawWorld: any): WorldData {
    const world = new WorldData();
    world.id = rawWorld.id || crypto.randomUUID();
    world.name = rawWorld.name || "Untitled World";
    world.entities = (rawWorld.entities || []).map(restoreEntity);
    return world;
}

/**
 * Restore a ModelData from raw JSON data.
 */
export function restoreModel(rawModel: any): ModelData {
    const model = new ModelData(rawModel.name || "Model", rawModel.id);
    model.thumbnail = rawModel.thumbnail || "";
    model.entities = (rawModel.entities || []).map(restoreEntity);
    return model;
}

/**
 * Restore a ScriptData from raw JSON data.
 */
export function restoreScript(rawScript: any): ScriptData {
    const script = new ScriptData(rawScript.name || "Script", rawScript.id);
    script.stateData = rawScript.stateData || {};
    script.scriptData = rawScript.scriptData || [];
    return script;
}

/**
 * Serialize a single Component into a clean plain JavaScript object.
 */
export function serializeComponent(comp: Component): any {
    const data: Record<string, any> = {};
    if (comp.data) {
        for (const [key, entry] of Object.entries(comp.data)) {
            if (!entry) continue;
            data[key] = {
                type: normalizeComponentDataType(entry.type) || entry.type,
                defaultValue: cleanValue(
                    entry.defaultValue !== undefined ? entry.defaultValue : entry.value,
                ),
                value: cleanValue(entry.value),
                tooltip: entry.tooltip || "",
            };
        }
    }
    return {
        id: comp.id,
        name: comp.name,
        tooltip: comp.tooltip || "",
        data,
    };
}

/**
 * Serialize a single Entity into a clean plain JavaScript object.
 */
export function serializeEntity(entity: Entity): any {
    return {
        id: entity.id,
        name: entity.name,
        baseEntity: entity.baseEntity,
        tags: Array.isArray(entity.tags) ? [...entity.tags] : [],
        components: (entity.components || []).map(serializeComponent),
        children: (entity.children || []).map(serializeEntity),
    };
}

/**
 * Serialize a WorldData into a clean plain JavaScript object.
 */
export function serializeWorld(world: WorldData): any {
    return {
        id: world.id,
        name: world.name,
        entities: (world.entities || []).map(serializeEntity),
    };
}

/**
 * Serialize a ModelData into a clean plain JavaScript object.
 */
export function serializeModel(model: ModelData): any {
    return {
        id: model.id,
        name: model.name,
        thumbnail: model.thumbnail || "",
        entities: (model.entities || []).map(serializeEntity),
    };
}

/**
 * Serialize a ScriptData into a clean plain JavaScript object.
 */
export function serializeScript(script: ScriptData): any {
    return {
        id: script.id,
        name: script.name,
        stateData: cleanValue(script.stateData || {}),
        scriptData: Array.isArray(script.scriptData)
            ? script.scriptData.map(cleanValue)
            : [],
    };
}

/**
 * Extract an entire GameData hierarchy into a clean plain JavaScript object,
 * bypassing Svelte 5 class prototype getter non-enumerability.
 */
export function serializeGameData(gameData: GameData): any {
    return {
        name: gameData.name || "Untitled Game",
        description: gameData.description || "",
        components: [],
        systems: [],
        worlds: (gameData.worlds || []).map(serializeWorld),
        models: (gameData.models || []).map(serializeModel),
        scripts: (gameData.scripts || []).map(serializeScript),
    };
}

/**
 * Serialize GameData into a clean, formatted JSON string.
 */
export function serializeProject(gameData: GameData): string {
    const plain = serializeGameData(gameData);
    return JSON.stringify(
        plain,
        (key, value) => {
            if (key === "events") return undefined;
            return value;
        },
        2,
    );
}

/**
 * Deserialize a JSON string or object into a fresh GameData instance.
 */
export function deserializeProject(jsonInput: string | object): GameData {
    const raw = typeof jsonInput === "string" ? JSON.parse(jsonInput) : jsonInput;
    const game = new GameData();
    game.name = raw.name || "Untitled Game";
    game.description = raw.description || "";

    game.worlds = (raw.worlds || []).map(restoreWorld);
    game.models = (raw.models || []).map(restoreModel);
    game.scripts = (raw.scripts || []).map(restoreScript);

    // If project has no worlds, ensure a default world is available
    if (game.worlds.length === 0) {
        const defaultWorld = new WorldData();
        defaultWorld.name = "Main World";
        game.worlds.push(defaultWorld);
    }

    return game;
}

/**
 * Trigger a browser file download of the project JSON.
 */
export function downloadProjectFile(gameData: GameData, customFilename?: string): void {
    const jsonStr = serializeProject(gameData);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    console.log("Project JSON serialized length:", jsonStr.length);

    const safeName = (customFilename || gameData.name || "tinystudio_project")
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/gi, "_");

    const a = document.createElement("a");
    a.href = url;
    a.download = `${safeName}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/**
 * Read and parse a project file uploaded by the user.
 */
export async function readProjectFile(file: File): Promise<GameData> {
    const text = await file.text();
    return deserializeProject(text);
}

/**
 * Generate a fresh blank project.
 */
export function createBlankProject(): GameData {
    const game = new GameData();
    game.name = "My Game";

    const world = new WorldData();
    world.name = "Main World";

    // Ground platform
    const ground = createPartEntity("Ground");
    const groundTransform = ground.components.find((c) => c.name === "Transform");
    if (groundTransform) {
        groundTransform.data.position.value = { x: 0, y: -0.5, z: 0 };
        groundTransform.data.scale.value = { x: 40, y: 1, z: 40 };
    }
    const groundPhysics = ground.components.find((c) => c.name === "Physics");
    if (groundPhysics) groundPhysics.data.anchored.value = true;
    const groundMesh = ground.components.find((c) => c.name === "Mesh");
    if (groundMesh) groundMesh.data.color.value = 0x1e293b;
    world.entities.push(ground);

    // Player
    const player = createPlayerEntity("Player");
    world.entities.push(player);

    // Follow Camera
    const camera = createCameraEntity("Follow Camera");
    const camComp = camera.components.find((c) => c.name === "Camera");
    if (camComp) {
        camComp.data.active.value = true;
        camComp.data.mode.value = "follow";
    }
    world.entities.push(camera);

    game.worlds.push(world);

    // Default script
    const script = new ScriptData("GameLogic");
    script.scriptData = [
        {
            code: `-- TinyStudio Game Logic
print("Game started!")

local count = 0
while true do
    wait(1)
    count = count + 1
end`,
        },
    ];
    game.scripts.push(script);

    return game;
}
