import { GameData, WorldData, ModelData, ScriptData } from "$lib/stores/data.svelte";
import {
    Entity,
    Component,
    createPartEntity,
    createPlayerEntity,
    createCameraEntity,
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
 * Restore an entity from raw JSON data with a fresh EventEmitter
 * and deep component structure.
 */
export function restoreEntity(rawEntity: any): Entity {
    const entity = new Entity();
    entity.id = rawEntity.id || crypto.randomUUID();
    entity.name = rawEntity.name || "Entity";
    entity.baseEntity = rawEntity.baseEntity || "part";
    entity.events = new EventEmitter();

    entity.components = (rawEntity.components || []).map((rawComp: any) => {
        const comp = new Component();
        comp.id = rawComp.id || crypto.randomUUID();
        comp.name = rawComp.name;
        comp.tooltip = rawComp.tooltip || "";
        comp.data = {};

        for (const [key, entry] of Object.entries(rawComp.data || {})) {
            const rawEntry = entry as any;
            comp.data[key] = {
                type: rawEntry.type,
                defaultValue: rawEntry.defaultValue !== undefined ? rawEntry.defaultValue : rawEntry.value,
                value: rawEntry.value,
                tooltip: rawEntry.tooltip || "",
                dirty: true,
            };
        }
        return comp;
    });

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
 * Serialize GameData into a clean JSON string, omitting internal EventEmitter listeners.
 */
export function serializeProject(gameData: GameData): string {
    return JSON.stringify(
        gameData,
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

    return game;
}

/**
 * Trigger a browser file download of the project JSON.
 */
export function downloadProjectFile(gameData: GameData, customFilename?: string): void {
    const jsonStr = serializeProject(gameData);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);

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
