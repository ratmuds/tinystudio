import * as THREE from "three";
import { System, type Entity } from "$lib/stores/ecs.svelte";
import type { GameData } from "$lib/stores/data.svelte";
import { EventEmitter } from "$lib/stores/EventEmitter";
import { LuaFactory, type LuaEngine, type LuaThread } from "wasmoon";
import { StateScope, SchedulerJob } from "./ScriptScheduler";
import { runtimeMetrics } from "$lib/stores/runtimeMetrics.svelte";

const factory = new LuaFactory();

function extractLuaError(raw: unknown): string {
    const str = String(raw);
    // wasmoon embeds JS source code when callbacks throw; pull out the actual error
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
    private lua: LuaEngine | null = null;
    private keysPressed: Set<string> = new Set();
    private inputManagerEvents = new EventEmitter();
    private onKeyDown: ((e: KeyboardEvent) => void) | null = null;
    private onKeyUp: ((e: KeyboardEvent) => void) | null = null;
    private currentScope: StateScope | null = null;

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
    }

    private async createLua(): Promise<LuaEngine> {
        const lua = await factory.createEngine();
        this.registerGlobals(lua);
        return lua;
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

    private registerGlobals(lua: LuaEngine): void {
        // 1. Vector3 Metatable
        lua.doStringSync(`
            Vector3 = {}
            Vector3.__index = Vector3

            function Vector3.new(x, y, z)
                return setmetatable({ x = x or 0, y = y or 0, z = z or 0 }, Vector3)
            end

            function Vector3:__tostring()
                return string.format("Vector3(%.4f, %.4f, %.4f)", self.x, self.y, self.z)
            end

            function Vector3.__add(a, b)
                return Vector3.new(a.x + b.x, a.y + b.y, a.z + b.z)
            end

            function Vector3.__sub(a, b)
                return Vector3.new(a.x - b.x, a.y - b.y, a.z - b.z)
            end

            function Vector3.__mul(a, b)
                if type(a) == "number" then
                    return Vector3.new(b.x * a, b.y * a, b.z * a)
                elseif type(b) == "number" then
                    return Vector3.new(a.x * b, a.y * b, a.z * b)
                end
                return Vector3.new(a.x * b.x, a.y * b.y, a.z * b.z)
            end

            function Vector3:length()
                return math.sqrt(self.x * self.x + self.y * self.y + self.z * self.z)
            end

            function Vector3:normalized()
                local len = self:length()
                if len == 0 then return Vector3.new(0, 0, 0) end
                return Vector3.new(self.x / len, self.y / len, self.z / len)
            end

            function Vector3:dot(other)
                return self.x * other.x + self.y * other.y + self.z * other.z
            end

            function Vector3:cross(other)
                return Vector3.new(
                    self.y * other.z - self.z * other.y,
                    self.z * other.x - self.x * other.z,
                    self.x * other.y - self.y * other.x
                )
            end
        `);

        // 2. Entity, component, and component-data metatables
        lua.global.set(
            "__warnUnsupportedComponentData",
            (componentName: string, key: string, type: string) => {
                console.warn(
                    `Lua component data "${componentName}.${key}" uses unsupported type "${type}". ` +
                        "Only string and vector3 are currently supported.",
                );
            },
        );

        lua.doStringSync(`
            Entity = {}
            Component = {}
            __eventCallbacks = {}
            __nextEventCallbackId = 0

            function __registerEventCallback(callback)
                __nextEventCallbackId = __nextEventCallbackId + 1
                local id = tostring(__nextEventCallbackId)
                __eventCallbacks[id] = callback
                return id
            end

            function __dispatchEventCallback(id, ...)
                local callback = __eventCallbacks[id]
                if not callback then return nil end

                return coroutine.create(function(...)
                    local count = select("#", ...)
                    local converted = {}
                    for i = 1, count do
                        local value = select(i, ...)
                        if (type(value) == "table" or type(value) == "userdata") and value.id then
                            local wrapped = getEntityById(value.id)
                            if wrapped then value = wrapped end
                        end
                        converted[i] = value
                    end
                    callback(table.unpack(converted, 1, count))
                end)
            end

            function Entity:_findComponent(name)
                if not self._components then return nil end
                local len = self._components.length or #self._components
                for i = 0, len - 1 do
                    local comp = self._components[i]
                    if comp and comp.name == name then
                        return comp
                    end
                end
                return nil
            end

            function Component:__index(key)
                local comp = rawget(self, "_component")
                local entry = comp.data[key]
                if not entry then return nil end

                if entry.type == "string" then
                    return entry.value
                elseif entry.type == "vector3" then
                    local value = entry.value
                    return Vector3.new(value.x, value.y, value.z)
                else
                    __warnUnsupportedComponentData(comp.name, key, entry.type)
                    return nil
                end
            end

            function Component:__newindex(key, value)
                local comp = rawget(self, "_component")
                local entry = comp.data[key]
                if not entry then
                    rawset(self, key, value)
                    return
                end

                if entry.type == "string" then
                    if type(value) ~= "string" then return end
                    entry.value = value
                    entry.dirty = true
                elseif entry.type == "vector3" then
                    if not value then return end
                    entry.value = {
                        x = value.x or 0,
                        y = value.y or 0,
                        z = value.z or 0
                    }
                    entry.dirty = true
                else
                    __warnUnsupportedComponentData(comp.name, key, entry.type)
                end
            end

            function Entity:__index(key)
                local method = rawget(Entity, key)
                if method then return method end

                local component = self:_findComponent(key:gsub("^%l", string.upper))
                if component then
                    return setmetatable({ _component = component }, Component)
                end
                return nil
            end

            function Entity:__newindex(key, value)
                rawset(self, key, value)
            end

            function Entity:on(eventName, callback)
                local callbackId = __registerEventCallback(callback)
                return __entityOn(self.id, eventName, callbackId)
            end

            function Entity:off(listenerId)
                __entityOff(self.id, listenerId)
            end

            function Entity:emit(eventName, ...)
                __entityEmit(self.id, eventName, ...)
            end

            game = {
                inputManager = {
                    isKeyPressed = function(keyCode)
                        return __isKeyPressedJS(keyCode)
                    end,
                    on = function(self, eventName, callback)
                        local callbackId = __registerEventCallback(callback)
                        return __inputManagerOn(eventName, callbackId)
                    end,
                    off = function(self, listenerId)
                        __inputManagerOff(listenerId)
                    end
                }
            }
        `);

        // 3. JS Data Fetching Helpers (pure functions, no Lua re-entry)
        lua.global.set("__findEntityByIdJS", (id: string) => {
            return this.entities.find((e) => e.id === id) ?? false;
        });

        lua.global.set("__findEntityByNameJS", (name: string) => {
            return this.entities.find((e) => e.name === name) ?? false;
        });

        lua.global.set("__isKeyPressedJS", (keyCode: string) => {
            return this.keysPressed.has(keyCode);
        });

        lua.global.set(
            "__inputManagerOn",
            (eventName: string, callbackId: string) => {
                const scope = this.currentScope;
                if (!scope) return undefined;

                const dispatch = (...args: any[]) => {
                    this.dispatchCallback(
                        scope,
                        callbackId,
                        args,
                        `inputManager.${eventName}`,
                    );
                };
                const listenerId = this.inputManagerEvents.on(
                    eventName,
                    dispatch,
                    scope,
                );
                scope.registrations.push({
                    emitter: this.inputManagerEvents,
                    listenerId,
                });
                return listenerId;
            },
        );

        lua.global.set("__inputManagerOff", (id: string) => {
            const scope = this.currentScope;
            if (scope) {
                scope.removeRegistration(id);
            } else {
                this.inputManagerEvents.off(id);
            }
        });

        lua.global.set(
            "__entityOn",
            (entityId: string, eventName: string, callbackId: string) => {
                const scope = this.currentScope;
                if (!scope) return undefined;

                const entity = this.entities.find((e) => e.id === entityId);
                if (!entity) return undefined;

                const dispatch = (...args: any[]) => {
                    this.dispatchCallback(
                        scope,
                        callbackId,
                        args,
                        `${entity.name}.${eventName}`,
                    );
                };
                const listenerId = entity.events.on(
                    eventName,
                    dispatch,
                    scope,
                );
                scope.registrations.push({
                    emitter: entity.events,
                    listenerId,
                });
                return listenerId;
            },
        );

        lua.global.set("__entityOff", (entityId: string, id: string) => {
            const scope = this.currentScope;
            if (scope) {
                scope.removeRegistration(id);
            } else {
                const entity = this.entities.find((e) => e.id === entityId);
                if (entity) entity.events.off(id);
            }
        });

        lua.global.set(
            "__entityEmit",
            (entityId: string, eventName: string, ...args: any[]) => {
                const entity = this.entities.find((e) => e.id === entityId);
                if (entity) entity.events.emit(eventName, ...args);
            },
        );

        // 4. Native Lua constructors for Entities (attaches Entity metatable directly in Lua)
        lua.doStringSync(`
            function getEntityById(id)
                local raw = __findEntityByIdJS(id)
                if not raw then return nil end
                local e = {
                    id = raw.id,
                    name = raw.name,
                    _components = raw.components,
                    events = raw.events
                }
                return setmetatable(e, Entity)
            end

            function getEntityByName(name)
                local raw = __findEntityByNameJS(name)
                if not raw then return nil end
                local e = {
                    id = raw.id,
                    name = raw.name,
                    _components = raw.components,
                    events = raw.events
                }
                return setmetatable(e, Entity)
            end
        `);
    }

    async startScript(entity: Entity): Promise<void> {
        if (!this.gameData) return;

        const scriptComp = entity.components.find((c) => c.name === "Script");
        if (!scriptComp) return;

        const scriptId = scriptComp.data.scriptId.value as string;
        const scriptData = this.gameData.scripts.find((s) => s.id === scriptId);
        if (!scriptData) {
            console.warn("Script data not found for entity", entity.id);
            return;
        }

        let currentNode = "start";

        const startEdge = scriptData.stateData.edges.find(
            (e: any) => e.source === currentNode,
        );
        if (!startEdge) return;

        currentNode = startEdge.target;
        if (currentNode === "end") return;

        const firstNodeData = scriptData.stateData.nodes.find(
            (n: any) => n.id === currentNode,
        );
        if (!firstNodeData) return;

        const firstScript = scriptData.scriptData.find(
            (s) => s.name === firstNodeData.data.script,
        );
        if (!firstScript) return;

        this.lua = await this.createLua();

        let currentNodeData = firstNodeData;

        let stateScope = new StateScope(this.lua, entity.id, entity.name);
        this.currentScope = stateScope;
        let wrappedCode = `local mainThread = coroutine.create(function()
            ${firstScript.code}
        end)
        return mainThread`;

        // Run the script once first, to get the mainThread and initial setup

        let thread: LuaThread;

        try {
            thread = await this.lua.doString(wrappedCode);
        } catch (e) {
            console.error(
                `[Lua Compile Error on Node "${currentNode}"]`,
                extractLuaError(e),
            );
            this.lua.global.close();
            return;
        }

        let mainThread: LuaThread = thread; // this.lua.global.get("mainThread");
        let schedulerJob: SchedulerJob = new SchedulerJob(
            crypto.randomUUID(),
            mainThread,
            0,
            "alive",
            "script",
            [],
        );
        stateScope.addJob(schedulerJob);

        const step = async () => {
            if (!this.running) {
                stateScope.clearRegistrations();
                this.lua?.global.close();
                runtimeMetrics.removeScope(entity.id);
                if (this.currentScope === stateScope) this.currentScope = null;
                return;
            }

            stateScope.step();

            // Report metrics every tick
            runtimeMetrics.updateScope(
                entity.id,
                entity.name,
                stateScope.getMetrics(),
                stateScope.primaryDead,
            );
            runtimeMetrics.recordLoad();

            if (
                stateScope.primaryDead &&
                stateScope.pendingJobs.length === 0 &&
                stateScope.pendingDispatches.length === 0 &&
                stateScope.jobs.every((j) => j.state === "dead")
            ) {
                stateScope.clearRegistrations();
                this.lua?.global.close();
                runtimeMetrics.removeScope(entity.id);
                if (this.currentScope === stateScope) this.currentScope = null;
                return;
            }

            requestAnimationFrame(step);
        };

        requestAnimationFrame(step);
    }

    emitToEntity(entityId: string, eventName: string, ...args: any[]): void {
        if (!this.lua) return;
        const fn = this.lua.global.get("__entityEmit");
        if (fn) fn(entityId, eventName, ...args);
    }

    update(_deltaTime: number, _entities: Entity[]): void {}

    cleanup(): void {
        this.running = false;
        if (this.currentScope) {
            this.currentScope.clearRegistrations();
            this.currentScope = null;
        }
        this.lua?.global.close();
        this.lua = null;
        this.entities = [];
        if (this.onKeyDown)
            window.removeEventListener("keydown", this.onKeyDown);
        if (this.onKeyUp) window.removeEventListener("keyup", this.onKeyUp);
        this.keysPressed.clear();
        this.inputManagerEvents.clear();
        runtimeMetrics.clear();
    }
}
