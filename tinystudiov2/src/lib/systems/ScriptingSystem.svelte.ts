import * as THREE from "three";
import { System, type Entity } from "$lib/stores/ecs.svelte";
import type { GameData, ScriptData } from "$lib/stores/data.svelte";
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

        // Pointer / mouse input. Position is normalized to [0..1] relative to
        // the window; delta is in raw pixels since the last frame.
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

    private registerGlobals(lua: LuaEngine, scope: StateScope): void {
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

            function Vector3.__div(a, b)
                if type(b) == "number" then
                    return Vector3.new(a.x / b, a.y / b, a.z / b)
                end
                return Vector3.new(a.x / b.x, a.y / b.y, a.z / b.z)
            end

            function Vector3:clone()
                return Vector3.new(self.x, self.y, self.z)
            end

            function Vector3:distance(other)
                local dx = self.x - other.x
                local dy = self.y - other.y
                local dz = self.z - other.z
                return math.sqrt(dx * dx + dy * dy + dz * dz)
            end

            function Vector3:lerp(other, t)
                t = t or 0.5
                return Vector3.new(
                    self.x + (other.x - self.x) * t,
                    self.y + (other.y - self.y) * t,
                    self.z + (other.z - self.z) * t
                )
            end

            -- Yaw/pitch are in radians and match the Camera component's
            -- orbit yaw/pitch, so they can drive the camera directly.
            function Vector3:getYaw()
                return math.atan2(self.x, self.z)
            end

            function Vector3:setYaw(yaw)
                local lenXZ = math.sqrt(self.x * self.x + self.z * self.z)
                self.x = math.sin(yaw) * lenXZ
                self.z = math.cos(yaw) * lenXZ
                return self
            end

            function Vector3:getPitch()
                return math.atan2(self.y, math.sqrt(self.x * self.x + self.z * self.z))
            end

            function Vector3:setPitch(pitch)
                local len = self:length()
                if len == 0 then return self end
                self.y = math.sin(pitch) * len
                local lenXZ = math.cos(pitch) * len
                local yaw = self:getYaw()
                self.x = math.sin(yaw) * lenXZ
                self.z = math.cos(yaw) * lenXZ
                return self
            end
        `);

        // 1b. Vector2 Metatable
        lua.doStringSync(`
            Vector2 = {}
            Vector2.__index = Vector2

            function Vector2.new(x, y)
                return setmetatable({ x = x or 0, y = y or 0 }, Vector2)
            end

            function Vector2:__tostring()
                return string.format("Vector2(%.4f, %.4f)", self.x, self.y)
            end

            function Vector2.__add(a, b)
                return Vector2.new(a.x + b.x, a.y + b.y)
            end

            function Vector2.__sub(a, b)
                return Vector2.new(a.x - b.x, a.y - b.y)
            end

            function Vector2.__mul(a, b)
                if type(a) == "number" then
                    return Vector2.new(b.x * a, b.y * a)
                elseif type(b) == "number" then
                    return Vector2.new(a.x * b, a.y * b)
                end
                return Vector2.new(a.x * b.x, a.y * b.y)
            end

            function Vector2:length()
                return math.sqrt(self.x * self.x + self.y * self.y)
            end
        `);

        // 2. Entity, component, and component-data metatables
        lua.global.set(
            "__warnUnsupportedComponentData",
            (componentName: string, key: string, type: string) => {
                console.warn(
                    `Lua component data "${componentName}.${key}" uses unsupported type "${type}". ` +
                        "Only string, number, boolean, and vector3 are currently supported.",
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
                if key == "on" or key == "off" or key == "emit" then
                    return rawget(Component, key)
                end

                local comp = rawget(self, "_component")
                local entry = comp.data[key]
                if not entry then return nil end

                if entry.type == "string" or entry.type == "number" or entry.type == "boolean" then
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
                elseif entry.type == "number" then
                    if type(value) ~= "number" then return end
                    entry.value = value
                    entry.dirty = true
                elseif entry.type == "boolean" then
                    if type(value) ~= "boolean" then return end
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

            -- Component event helpers. "part.physics:on('touched', cb)" is an
            -- alias for "part:on('Physics.touched', cb)" — the component name
            -- prefixes the event name automatically.
            function Component:on(eventName, callback)
                local comp = rawget(self, "_component")
                local entity = rawget(self, "_entity")
                if not comp or not entity then return nil end
                local callbackId = __registerEventCallback(callback)
                return __entityOn(entity.id, comp.name .. "." .. eventName, callbackId)
            end

            function Component:off(listenerId)
                local entity = rawget(self, "_entity")
                if entity then __entityOff(entity.id, listenerId) end
            end

            function Component:emit(eventName, ...)
                local comp = rawget(self, "_component")
                local entity = rawget(self, "_entity")
                if not comp or not entity then return end
                __entityEmit(entity.id, comp.name .. "." .. eventName, ...)
            end

            function Entity:__index(key)
                local method = rawget(Entity, key)
                if method then return method end

                local component = self:_findComponent(key:gsub("^%l", string.upper))
                if component then
                    return setmetatable(
                        { _component = component, _entity = self },
                        Component
                    )
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
                    isMouseButtonDown = function(button)
                        return __isMouseButtonDownJS(button)
                    end,
                    getMousePosition = function()
                        local p = __getMousePositionJS()
                        return Vector2.new(p[1] or 0, p[2] or 0)
                    end,
                    getMouseDelta = function()
                        local p = __getMouseDeltaJS()
                        return Vector2.new(p[1] or 0, p[2] or 0)
                    end,
                    getScroll = function()
                        return __getScrollJS()
                    end,
                    on = function(self, eventName, callback)
                        local callbackId = __registerEventCallback(callback)
                        return __inputManagerOn(eventName, callbackId)
                    end,
                    off = function(self, listenerId)
                        __inputManagerOff(listenerId)
                    end
                },
                setActiveCamera = function(entityId)
                    return __setActiveCameraJS(entityId)
                end,
                getActiveCamera = function()
                    local id = __getActiveCameraJS()
                    if not id then return nil end
                    return getEntityById(id)
                end
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

        lua.global.set("__isMouseButtonDownJS", (button: number) => {
            return this.mouseButtons.has(button);
        });

        lua.global.set("__getMousePositionJS", () => {
            return [this.mousePosition.x, this.mousePosition.y];
        });

        lua.global.set("__getMouseDeltaJS", () => {
            return [this.mouseDelta.x, this.mouseDelta.y];
        });

        lua.global.set("__getScrollJS", () => {
            return this.scrollY;
        });

        // Camera selection. The active camera is the entity with a Camera
        // component whose `active` flag is true (falling back to the first
        // one). Setting it flips `active` on all camera entities so the
        // CameraSystem picks the right one next frame.
        lua.global.set("__getActiveCameraJS", () => {
            const cameras = this.entities.filter((e) =>
                e.components.some((c) => c.name === "Camera"),
            );
            const active =
                cameras.find((e) => {
                    const comp = e.components.find(
                        (c) => c.name === "Camera",
                    );
                    return comp?.data.active.value === true;
                }) ?? cameras[0];
            return active ? active.id : false;
        });

        lua.global.set("__setActiveCameraJS", (entityId: string) => {
            let found = false;
            for (const e of this.entities) {
                const comp = e.components.find((c) => c.name === "Camera");
                if (!comp) continue;
                const active = e.id === entityId;
                if (active) found = true;
                comp.data.active.value = active;
                comp.data.active.dirty = true;
            }
            return found;
        });

        lua.global.set(
            "__inputManagerOn",
            (eventName: string, callbackId: string) => {
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
            scope.removeRegistration(id);
        });

        lua.global.set(
            "__entityOn",
            (entityId: string, eventName: string, callbackId: string) => {
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
                const listenerId = entity.events.on(eventName, dispatch, scope);
                scope.registrations.push({
                    emitter: entity.events,
                    listenerId,
                });
                return listenerId;
            },
        );

        lua.global.set("__entityOff", (_entityId: string, id: string) => {
            scope.removeRegistration(id);
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
    // graph, follow it from the "start" node (existing behavior). Otherwise run first block.
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
        console.warn(
            `Script "${scriptData.name}" has no valid state graph; running first code block.`,
        );
        return scriptData.scriptData.find(
            (s) => s && typeof s.code === "string" && s.code.trim().length > 0,
        )?.code;
    }

    emitToEntity(entityId: string, eventName: string, ...args: any[]): void {
        const entity = this.entities.find((e) => e.id === entityId);
        entity?.events.emit(eventName, ...args);
    }

    update(_deltaTime: number, _entities: Entity[]): void {
        if (!this.running) return;

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
