import type { LuaEngine } from "wasmoon";
import type { StateScope } from "../../ScriptScheduler";
import type { ScriptContext, ScriptModule } from "../types";

export class TimeModule implements ScriptModule {
    register(lua: LuaEngine, _scope: StateScope, ctx: ScriptContext): void {
        lua.global.set("__getTimeDeltaJS", () => ctx.getTime().deltaTime);
        lua.global.set("__getTimeElapsedJS", () => ctx.getTime().time);
        lua.global.set("__getTimeFrameCountJS", () => ctx.getTime().frameCount);

        lua.doStringSync(`
            Time = {}

            local Time_mt = {
                __index = function(t, k)
                    if k == "deltaTime" or k == "dt" then
                        return __getTimeDeltaJS()
                    elseif k == "time" or k == "elapsed" then
                        return __getTimeElapsedJS()
                    elseif k == "frameCount" or k == "frame" then
                        return __getTimeFrameCountJS()
                    end
                    return nil
                end,
                __newindex = function() end
            }
            setmetatable(Time, Time_mt)
        `);
    }
}
