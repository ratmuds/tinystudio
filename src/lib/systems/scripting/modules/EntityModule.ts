import type { LuaEngine } from "wasmoon";
import type { StateScope } from "../../ScriptScheduler";
import type { ScriptContext, ScriptModule } from "../types";

export class EntityModule implements ScriptModule {
    register(lua: LuaEngine, scope: StateScope, ctx: ScriptContext): void {
        // 1. Register JS bridges for Entity lifecycle and events
        lua.global.set("__findEntityByIdJS", (id: string) => {
            return ctx.getEntities().find((e) => e.id === id) ?? false;
        });

        lua.global.set("__findEntityByNameJS", (name: string) => {
            return ctx.getEntities().find((e) => e.name === name) ?? false;
        });

        lua.global.set("__destroyEntityJS", (id: string) => {
            const entity = ctx.getEntities().find((e) => e.id === id);
            if (entity) {
                entity.events.emit("Physics.destroyBody");
                entity.events.emit("entity.destroyed");
            }
            ctx.removeEntity(id);
        });

        lua.global.set(
            "__entityOn",
            (entityId: string, eventName: string, callbackId: string) => {
                const entity = ctx.getEntities().find((e) => e.id === entityId);
                if (!entity) return undefined;

                const dispatch = (...args: any[]) => {
                    ctx.dispatchCallback(
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
                const entity = ctx.getEntities().find((e) => e.id === entityId);
                if (entity) entity.events.emit(eventName, ...args);
            },
        );

        lua.global.set("__entityAddTagJS", (entityId: string, tag: string) => {
            const entity = ctx.getEntities().find((e) => e.id === entityId);
            if (!entity) return;
            if (!entity.tags) entity.tags = [];
            if (!entity.tags.includes(tag)) entity.tags.push(tag);
        });

        lua.global.set(
            "__entityRemoveTagJS",
            (entityId: string, tag: string) => {
                const entity = ctx.getEntities().find((e) => e.id === entityId);
                if (entity && entity.tags) {
                    entity.tags = entity.tags.filter((t) => t !== tag);
                }
            },
        );

        lua.global.set("__entityHasTagJS", (entityId: string, tag: string) => {
            const entity = ctx.getEntities().find((e) => e.id === entityId);
            return entity?.tags ? entity.tags.includes(tag) : false;
        });

        lua.global.set("__findEntitiesByTagJS", (tag: string) => {
            const found = ctx
                .getEntities()
                .filter((e) => e.tags && e.tags.includes(tag));
            return found.map((e) => e.id);
        });

        lua.global.set("__getAllEntityIdsJS", () => {
            return ctx.getEntities().map((e) => e.id);
        });

        // 2. Define LiveVector3, Component, and Entity metatables in Lua
        lua.doStringSync(`
            -- LiveVector3 Metatable:
            -- Instead of generating separate metatables per vector access, all live vectors
            -- share this singleton metatable which directly maps to and from the component entry value.
            local LiveVector3_mt = {
                __index = function(t, k)
                    if Vector3[k] then return Vector3[k] end
                    local entry = rawget(t, "_e")
                    local val = entry and entry.value
                    if not val then return nil end
                    local lk = string.lower(tostring(k))
                    if lk == "x" or lk == "y" or lk == "z" then
                        return val[lk] or val[k]
                    end
                    return nil
                end,
                __newindex = function(t, k, val)
                    local entry = rawget(t, "_e")
                    if not entry or not entry.value then return end
                    local lk = string.lower(tostring(k))
                    if lk == "x" or lk == "y" or lk == "z" then
                        entry.value[lk] = val
                        entry.value[k] = val
                        entry.dirty = true
                    else
                        rawset(t, k, val)
                    end
                end,
                __tostring = Vector3.__tostring,
                __add = Vector3.__add,
                __sub = Vector3.__sub,
                __mul = Vector3.__mul,
                __div = Vector3.__div,
            }

            local function __createLiveVector3(entry)
                return setmetatable({ _e = entry }, LiveVector3_mt)
            end

            -- Component Metatable:
            -- Unified reading and writing of component properties without repetitive type checks.
            Component = {}

            Component.__index = function(self, key)
                local method = Component[key]
                if method then return method end

                local comp = rawget(self, "_component")
                if not comp or not comp.data then return nil end
                local entry = comp.data[key] or comp.data[string.lower(tostring(key))]
                if not entry then return nil end

                if entry.type == "vector3" then
                    return __createLiveVector3(entry)
                end
                return entry.value
            end

            Component.__newindex = function(self, key, value)
                local comp = rawget(self, "_component")
                if not comp or not comp.data then
                    rawset(self, key, value)
                    return
                end
                local entry = comp.data[key] or comp.data[string.lower(tostring(key))]
                if not entry then
                    rawset(self, key, value)
                    return
                end

                if entry.type == "vector3" then
                    if value then
                        entry.value.x = value.x or value.X or 0
                        entry.value.y = value.y or value.Y or 0
                        entry.value.z = value.z or value.Z or 0
                        entry.dirty = true
                    end
                else
                    entry.value = value
                    entry.dirty = true
                end
            end

            function Component:applyImpulse(x, y, z)
                local entity = rawget(self, "_entity")
                if not entity then return end
                local v = (type(x) == "table") and { x = x.x or 0, y = x.y or 0, z = x.z or 0 } or { x = x or 0, y = y or 0, z = z or 0 }
                __entityEmit(entity.id, "Physics.applyImpulse", v)
            end

            function Component:setVelocity(x, y, z)
                local entity = rawget(self, "_entity")
                if not entity then return end
                local v = (type(x) == "table") and { x = x.x or 0, y = x.y or 0, z = x.z or 0 } or { x = x or 0, y = y or 0, z = z or 0 }
                __entityEmit(entity.id, "Physics.setVelocity", v)
            end

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

            -- Entity Metatable:
            -- Dynamic component indexing with fast caching, lifecycle and event dispatching.
            Entity = {}

            function Entity:_findComponent(name)
                if not self._components then return nil end
                local target = string.lower(tostring(name))
                local len = self._components.length or #self._components
                -- Check 0-based index first (standard for JavaScript arrays bridged through Wasmoon)
                local c0 = self._components[0]
                if c0 and c0.name and string.lower(c0.name) == target then
                    return c0
                end
                -- Check 1-based indices
                for i = 1, len do
                    local comp = self._components[i]
                    if comp and comp.name and string.lower(comp.name) == target then
                        return comp
                    end
                end
                -- Fallback loop from 0 to len
                for i = 0, len do
                    local comp = self._components[i]
                    if comp and comp.name and string.lower(comp.name) == target then
                        return comp
                    end
                end
                return nil
            end

            Entity.__index = function(self, key)
                local method = Entity[key]
                if method then return method end

                local cache = rawget(self, "_compCache")
                if not cache then
                    cache = {}
                    rawset(self, "_compCache", cache)
                end
                if cache[key] ~= nil then
                    return cache[key]
                end

                local component = self:_findComponent(key)
                if component then
                    local wrapped = setmetatable(
                        { _component = component, _entity = self },
                        Component
                    )
                    cache[key] = wrapped
                    return wrapped
                end

                -- Direct convenience shortcuts for Transform: position, rotation, scale
                local lk = string.lower(tostring(key))
                if lk == "position" or lk == "rotation" or lk == "scale" then
                    local transform = self:_findComponent("Transform")
                    if transform then
                        local wrapped = setmetatable(
                            { _component = transform, _entity = self },
                            Component
                        )
                        return wrapped[lk]
                    end
                end

                return nil
            end

            Entity.__newindex = function(self, key, value)
                local lk = string.lower(tostring(key))
                if lk == "position" or lk == "rotation" or lk == "scale" then
                    local transform = self:_findComponent("Transform")
                    if transform then
                        local wrapped = setmetatable(
                            { _component = transform, _entity = self },
                            Component
                        )
                        wrapped[lk] = value
                        return
                    end
                end
                rawset(self, key, value)
            end

            function Entity:getComponent(name)
                local comp = self:_findComponent(name)
                if comp then
                    return setmetatable(
                        { _component = comp, _entity = self },
                        Component
                    )
                end
                return nil
            end

            function Entity:on(eventName, callback)
                local callbackId = __registerEventCallback(callback)
                return __entityOn(self.id, eventName, callbackId)
            end

            function Entity:off(listenerId)
                __entityOff(self.id, listenerId)
            end

            function Entity:destroy()
                __destroyEntityJS(self.id)
            end

            function Entity:emit(eventName, ...)
                __entityEmit(self.id, eventName, ...)
            end

            function Entity:addTag(tag)
                __entityAddTagJS(self.id, tostring(tag))
            end

            function Entity:removeTag(tag)
                __entityRemoveTagJS(self.id, tostring(tag))
            end

            function Entity:hasTag(tag)
                return __entityHasTagJS(self.id, tostring(tag))
            end

            -- Entity global constructors and queries
            function getEntityById(id)
                local raw = __findEntityByIdJS(id)
                if not raw then return nil end
                return setmetatable({
                    id = raw.id,
                    name = raw.name,
                    _components = raw.components,
                    events = raw.events
                }, Entity)
            end

            function getEntityByName(name)
                local raw = __findEntityByNameJS(name)
                if not raw then return nil end
                return setmetatable({
                    id = raw.id,
                    name = raw.name,
                    _components = raw.components,
                    events = raw.events
                }, Entity)
            end

            function getEntitiesByTag(tag)
                local ids = __findEntitiesByTagJS(tostring(tag))
                local list = {}
                if ids then
                    local len = ids.length or #ids
                    for i = 0, len do
                        local id = ids[i]
                        if id then
                            local wrapped = getEntityById(id)
                            if wrapped then table.insert(list, wrapped) end
                        end
                    end
                end
                return list
            end

            function getEntityByTag(tag)
                local list = getEntitiesByTag(tag)
                return list[1]
            end

            function getAllEntities()
                local ids = __getAllEntityIdsJS()
                local list = {}
                if ids then
                    local len = ids.length or #ids
                    for i = 0, len do
                        local id = ids[i]
                        if id then
                            local wrapped = getEntityById(id)
                            if wrapped then table.insert(list, wrapped) end
                        end
                    end
                end
                return list
            end
        `);
    }
}
