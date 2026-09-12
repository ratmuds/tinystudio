import type { LuaEngine } from "wasmoon";
import type { StateScope } from "../../ScriptScheduler";
import type { ScriptContext, ScriptModule } from "../types";

export class CameraModule implements ScriptModule {
    register(lua: LuaEngine, _scope: StateScope, ctx: ScriptContext): void {
        lua.global.set("__getActiveCameraJS", () => {
            const cameras = ctx
                .getEntities()
                .filter((e) => e.components.some((c) => c.name === "Camera"));
            const active =
                cameras.find((e) => {
                    const comp = e.components.find((c) => c.name === "Camera");
                    return comp?.data.active?.value === true;
                }) ?? cameras[0];
            return active ? active.id : false;
        });

        lua.global.set("__setActiveCameraJS", (entityId: string) => {
            let found = false;
            for (const e of ctx.getEntities()) {
                const comp = e.components.find((c) => c.name === "Camera");
                if (!comp) continue;
                const active = e.id === entityId;
                if (active) found = true;
                comp.data.active.value = active;
                comp.data.active.dirty = true;
            }
            return found;
        });

        lua.doStringSync(`
            if not game then game = {} end

            game.setActiveCamera = function(entityId)
                return __setActiveCameraJS(entityId)
            end

            game.getActiveCamera = function()
                local id = __getActiveCameraJS()
                if not id then return nil end
                return getEntityById(id)
            end
        `);
    }
}
