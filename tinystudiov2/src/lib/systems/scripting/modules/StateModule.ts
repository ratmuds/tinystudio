import type { LuaEngine } from "wasmoon";
import type { StateScope } from "../../ScriptScheduler";
import type { ScriptContext, ScriptModule } from "../types";

export class StateModule implements ScriptModule {
    register(lua: LuaEngine, scope: StateScope, ctx: ScriptContext): void {
        // Global State JS bridges
        lua.global.set("__globalGetJS", (key: string) => {
            const val = ctx.getGlobalState().get(key);
            return val !== undefined ? val : null;
        });

        lua.global.set("__globalSetJS", (key: string, val: any) => {
            const oldVal = ctx.getGlobalState().get(key);
            ctx.getGlobalState().set(key, val);
            ctx.getBroadcastEvents().emit(`global.change.${key}`, val, oldVal);
        });

        lua.global.set(
            "__globalOnChangeJS",
            (key: string, callbackId: string) => {
                const dispatch = (newVal: any, oldVal: any) => {
                    ctx.dispatchCallback(
                        scope,
                        callbackId,
                        [newVal, oldVal],
                        `Global.onChange.${key}`,
                    );
                };
                const emitter = ctx.getBroadcastEvents();
                const listenerId = emitter.on(
                    `global.change.${key}`,
                    dispatch,
                    scope,
                );
                scope.registrations.push({
                    emitter,
                    listenerId,
                });
                return listenerId;
            },
        );

        // Broadcast Event Bus JS bridges
        lua.global.set(
            "__broadcastEmitJS",
            (eventName: string, ...args: any[]) => {
                ctx.getBroadcastEvents().emit(`broadcast.${eventName}`, ...args);
            },
        );

        lua.global.set(
            "__broadcastOnJS",
            (eventName: string, callbackId: string) => {
                const dispatch = (...args: any[]) => {
                    ctx.dispatchCallback(
                        scope,
                        callbackId,
                        args,
                        `Broadcast.${eventName}`,
                    );
                };
                const emitter = ctx.getBroadcastEvents();
                const listenerId = emitter.on(
                    `broadcast.${eventName}`,
                    dispatch,
                    scope,
                );
                scope.registrations.push({
                    emitter,
                    listenerId,
                });
                return listenerId;
            },
        );

        lua.global.set("__broadcastOffJS", (id: string) => {
            scope.removeRegistration(id);
        });

        lua.doStringSync(`
            -- Global State blackboard
            Global = {}

            local Global_mt = {
                __index = function(t, k)
                    if k == "get" then
                        return function(key)
                            return __globalGetJS(key)
                        end
                    elseif k == "set" then
                        return function(key, val)
                            __globalSetJS(key, val)
                        end
                    elseif k == "onChange" then
                        return function(key, cb)
                            local callbackId = __registerEventCallback(cb)
                            return __globalOnChangeJS(key, callbackId)
                        end
                    end
                    return __globalGetJS(k)
                end,
                __newindex = function(t, k, v)
                    __globalSetJS(k, v)
                end
            }
            setmetatable(Global, Global_mt)

            -- State is a clean alias for Global
            State = Global

            -- Broadcast Event Bus
            Broadcast = {
                emit = function(eventName, ...)
                    __broadcastEmitJS(eventName, ...)
                end,
                on = function(eventName, callback)
                    local callbackId = __registerEventCallback(callback)
                    return __broadcastOnJS(eventName, callbackId)
                end,
                off = function(listenerId)
                    __broadcastOffJS(listenerId)
                end
            }
        `);
    }
}
