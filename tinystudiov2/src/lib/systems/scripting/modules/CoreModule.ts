import type { LuaEngine } from "wasmoon";
import type { StateScope } from "../../ScriptScheduler";
import type { ScriptContext, ScriptModule } from "../types";

export class CoreModule implements ScriptModule {
    register(lua: LuaEngine, _scope: StateScope, _ctx: ScriptContext): void {
        lua.doStringSync(`
            -- Coroutine wait function
            function wait(seconds)
                coroutine.yield(seconds or 0)
            end

            -- Global event callback registry for bridging JS listeners to Lua coroutines
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
                            if getEntityById then
                                local wrapped = getEntityById(value.id)
                                if wrapped then value = wrapped end
                            end
                        end
                        converted[i] = value
                    end
                    callback(table.unpack(converted, 1, count))
                end)
            end
        `);
    }
}
