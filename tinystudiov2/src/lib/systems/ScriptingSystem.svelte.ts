import * as THREE from "three";
import { System, type Entity } from "$lib/stores/ecs.svelte";
import type { GameData, ScriptData } from "$lib/stores/data.svelte";
import { EventEmitter } from "$lib/stores/EventEmitter";
import { LuaFactory, type LuaEngine, type LuaThread } from "wasmoon";
import { StateScope, SchedulerJob } from "./ScriptScheduler";
import { runtimeMetrics } from "$lib/stores/runtimeMetrics.svelte";
import {
    MathModule,
    CoreModule,
    EntityModule,
    InputModule,
    UIModule,
    CameraModule,
    StateModule,
    TimeModule,
    type ScriptContext,
    type ScriptModule,
} from "./scripting";

const factory = new LuaFactory();

function extractLuaError(raw: unknown): string {
    const str = String(raw);
    const lines = str.split("\n");
    for (const line of lines) {
        const match = line.match(
            /(TypeError|Error|ReferenceError|RangeError):.+/,
        );
        if (match) return match[0].trim();
    }
    for (let i = lines.length - 1; i >= 0; i--) {
        if (lines[i].trim()) return lines[i].trim();
    }
    return str;
}

export class ScriptingSystem extends System {
    private scene: THREE.Scene | null = null;
    private gameData: GameData | null = null;
    private entities: Entity[] = [];
    private running = false;
    private keysPressed: Set<string> = new Set();
    private inputManagerEvents = new EventEmitter();
    private onKeyDown: ((e: KeyboardEvent) => void) | null = null;
    private onKeyUp: ((e: KeyboardEvent) => void) | null = null;
    private mouseButtons: Set<number> = new Set();
    private mousePosition = { x: 0, y: 0 };
    private mouseDelta = { x: 0, y: 0 };
    private scrollY = 0;
    private onPointerMove: ((e: PointerEvent) => void) | null = null;
    private onPointerDown: ((e: PointerEvent) => void) | null = null;
    private onPointerUp: ((e: PointerEvent) => void) | null = null;
    private onWheel: ((e: WheelEvent) => void) | null = null;
    private scopes = new Map<string, { lua: LuaEngine; scope: StateScope }>();

    // Shared global state, broadcast events, and time tracking
    private globalState = new Map<string, any>();
    private broadcastEvents = new EventEmitter();
    private elapsedTime = 0;
    private lastDeltaTime = 0;
    private frameCount = 0;

    private modules: ScriptModule[] = [
        new MathModule(),
        new CoreModule(),
        new EntityModule(),
        new InputModule(),
        new UIModule(),
        new CameraModule(),
        new StateModule(),
        new TimeModule(),
    ];

    constructor(scene: THREE.Scene, gameData: GameData) {
        super();
        this.id = crypto.randomUUID();
        this.name = "ScriptingSystem";
        this.tooltip = "Executes Lua scripts for game logic and behavior.";
        this.relatedComponents = ["Script"];
        this.scene = scene;
        this.gameData = gameData;
    }

    async setup(entities: Entity[]): Promise<void> {
        if (!this.scene || !this.gameData) return;
        this.entities = entities;
        this.running = true;

        this.onKeyDown = (e: KeyboardEvent) => {
            this.keysPressed.add(e.code);
            this.inputManagerEvents.emit("keyDown", e.code);
        };
        this.onKeyUp = (e: KeyboardEvent) => {
            this.keysPressed.delete(e.code);
            this.inputManagerEvents.emit("keyUp", e.code);
        };
        window.addEventListener("keydown", this.onKeyDown);
        window.addEventListener("keyup", this.onKeyUp);

        // Pointer / mouse input. Position is normalized to [0..1] relative to the window;
        // delta is in raw pixels since the last frame.
        this.onPointerMove = (e: PointerEvent) => {
            this.mousePosition.x = e.clientX / window.innerWidth;
            this.mousePosition.y = e.clientY / window.innerHeight;
            this.mouseDelta.x += e.movementX;
            this.mouseDelta.y += e.movementY;
            this.inputManagerEvents.emit("mouseMove");
        };
        this.onPointerDown = (e: PointerEvent) => {
            this.mouseButtons.add(e.button);
            this.inputManagerEvents.emit("mouseDown", e.button);
        };
        this.onPointerUp = (e: PointerEvent) => {
            this.mouseButtons.delete(e.button);
            this.inputManagerEvents.emit("mouseUp", e.button);
        };
        this.onWheel = (e: WheelEvent) => {
            this.scrollY += e.deltaY;
            this.inputManagerEvents.emit("scroll");
        };
        window.addEventListener("pointermove", this.onPointerMove);
        window.addEventListener("pointerdown", this.onPointerDown);
        window.addEventListener("pointerup", this.onPointerUp);
        window.addEventListener("wheel", this.onWheel);
    }

    private async createLua(): Promise<LuaEngine> {
        return factory.createEngine();
    }

    private dispatchCallback(
        scope: StateScope,
        callbackId: string,
        args: any[],
        name: string,
    ): void {
        const dispatch = scope.lua.global.get("__dispatchEventCallback") as
            | ((id: string) => LuaThread | null)
            | undefined;
        if (!dispatch) return;

        const thread = dispatch(callbackId);
        if (!thread) return;

        scope.pendingJobs.push(
            new SchedulerJob(
                crypto.randomUUID(),
                thread,
                0,
                "queued",
                "callback",
                args,
                name,
            ),
        );
    }

    private createContext(): ScriptContext {
        return {
            getEntities: () => this.entities,
            removeEntity: (id: string) => {
                this.entities = this.entities.filter((e) => e.id !== id);
            },
            getKeysPressed: () => this.keysPressed,
            getMouseButtons: () => this.mouseButtons,
            getMousePosition: () => this.mousePosition,
            getMouseDelta: () => this.mouseDelta,
            getScrollY: () => this.scrollY,
            getInputEvents: () => this.inputManagerEvents,
            getGlobalState: () => this.globalState,
            getBroadcastEvents: () => this.broadcastEvents,
            getTime: () => ({
                time: this.elapsedTime,
                deltaTime: this.lastDeltaTime,
                frameCount: this.frameCount,
            }),
            dispatchCallback: (scope, callbackId, args, name) => {
                this.dispatchCallback(scope, callbackId, args, name);
            },
        };
    }

    private registerGlobals(lua: LuaEngine, scope: StateScope): void {
        const ctx = this.createContext();
        for (const mod of this.modules) {
            mod.register(lua, scope, ctx);
        }
    }

    async startScript(entity: Entity): Promise<void> {
        if (!this.gameData) return;

        // Tear down any previous run for this entity (e.g. play restarted).
        const existing = this.scopes.get(entity.id);
        if (existing) {
            existing.scope.clearRegistrations();
            existing.lua.global.close();
            runtimeMetrics.removeScope(entity.id);
            this.scopes.delete(entity.id);
        }

        const scriptComp = entity.components.find((c) => c.name === "Script");
        if (!scriptComp) return;

        const scriptId = scriptComp.data.scriptId.value as string;
        const scriptData = this.gameData.scripts.find((s) => s.id === scriptId);
        if (!scriptData) {
            console.warn("Script data not found for entity", entity.id);
            return;
        }

        const code = this.resolveScriptCode(scriptData);
        if (!code) {
            console.warn("No runnable script code for entity", entity.id);
            return;
        }

        const lua = await this.createLua();
        const stateScope = new StateScope(lua, entity.id, entity.name);
        this.registerGlobals(lua, stateScope);

        const wrappedCode = `local mainThread = coroutine.create(function()
            this = getEntityById("${entity.id}")
            entity = this
            Transform = this and this.Transform
            Physics = this and this.Physics
            UIComp = this and this.UI
            ${code}
        end)
        return mainThread`;

        let thread: LuaThread;

        try {
            thread = await lua.doString(wrappedCode);
        } catch (e) {
            console.error(
                `[Lua Compile Error on Entity "${entity.name}"]`,
                extractLuaError(e),
            );
            lua.global.close();
            return;
        }

        stateScope.addJob(
            new SchedulerJob(
                crypto.randomUUID(),
                thread,
                0,
                "alive",
                "script",
                [],
            ),
        );

        this.scopes.set(entity.id, { lua, scope: stateScope });
    }

    // Resolve which code block to run for a script. If the script has a state
    // graph, follow it from the "start" node. Otherwise run first block.
    private resolveScriptCode(scriptData: ScriptData): string | undefined {
        const stateData = scriptData.stateData ?? {};
        const edges: any[] = Array.isArray(stateData.edges)
            ? stateData.edges
            : [];
        const nodes: any[] = Array.isArray(stateData.nodes)
            ? stateData.nodes
            : [];

        if (edges.length > 0) {
            const startEdge = edges.find((e: any) => e?.source === "start");

            // A graph that explicitly leads to "end" means "run nothing".
            if (startEdge?.target === "end") return undefined;

            if (startEdge?.target) {
                const node = nodes.find((n: any) => n?.id === startEdge.target);
                const block = node?.data?.script
                    ? scriptData.scriptData.find(
                          (s) => s?.name === node.data.script,
                      )
                    : undefined;
                if (block && typeof block.code === "string") return block.code;
            }
        }

        // No usable graph: run the first block that has real code.
        return scriptData.scriptData.find(
            (s) => s && typeof s.code === "string" && s.code.trim().length > 0,
        )?.code;
    }

    emitToEntity(entityId: string, eventName: string, ...args: any[]): void {
        const entity = this.entities.find((e) => e.id === entityId);
        entity?.events.emit(eventName, ...args);
    }

    update(deltaTime: number, _entities: Entity[]): void {
        if (!this.running) return;

        this.elapsedTime += deltaTime;
        this.lastDeltaTime = deltaTime;
        this.frameCount++;

        // Step every active script scope once per runtime frame
        for (const [entityId, { lua, scope }] of [...this.scopes]) {
            try {
                scope.step();

                runtimeMetrics.updateScope(
                    entityId,
                    scope.entityName,
                    scope.getMetrics(),
                    scope.primaryDead,
                );
                runtimeMetrics.recordLoad();

                const done =
                    scope.primaryDead &&
                    scope.pendingJobs.length === 0 &&
                    scope.pendingDispatches.length === 0 &&
                    scope.jobs.every((j) => j.state === "dead");

                if (done) {
                    scope.clearRegistrations();
                    lua.global.close();
                    runtimeMetrics.removeScope(entityId);
                    this.scopes.delete(entityId);
                }
            } catch (e) {
                console.error(
                    `[Lua Runtime Error on Entity "${scope.entityName}"]`,
                    extractLuaError(e),
                );
                scope.clearRegistrations();
                lua.global.close();
                runtimeMetrics.removeScope(entityId);
                this.scopes.delete(entityId);
            }
        }

        // Mouse delta / scroll accumulate between frames; reset them per tick.
        this.mouseDelta.x = 0;
        this.mouseDelta.y = 0;
        this.scrollY = 0;
    }

    cleanup(): void {
        this.running = false;
        for (const { lua, scope } of this.scopes.values()) {
            scope.clearRegistrations();
            lua.global.close();
        }
        this.scopes.clear();
        this.entities = [];
        this.globalState.clear();
        this.broadcastEvents.clear();
        this.elapsedTime = 0;
        this.lastDeltaTime = 0;
        this.frameCount = 0;
        if (this.onKeyDown)
            window.removeEventListener("keydown", this.onKeyDown);
        if (this.onKeyUp) window.removeEventListener("keyup", this.onKeyUp);
        if (this.onPointerMove)
            window.removeEventListener("pointermove", this.onPointerMove);
        if (this.onPointerDown)
            window.removeEventListener("pointerdown", this.onPointerDown);
        if (this.onPointerUp)
            window.removeEventListener("pointerup", this.onPointerUp);
        if (this.onWheel) window.removeEventListener("wheel", this.onWheel);
        this.keysPressed.clear();
        this.mouseButtons.clear();
        this.mousePosition = { x: 0, y: 0 };
        this.mouseDelta = { x: 0, y: 0 };
        this.scrollY = 0;
        this.inputManagerEvents.clear();
        runtimeMetrics.clear();
    }
}
