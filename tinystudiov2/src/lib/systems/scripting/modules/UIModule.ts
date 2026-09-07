import type { LuaEngine } from "wasmoon";
import type { StateScope } from "../../ScriptScheduler";
import type { ScriptContext, ScriptModule } from "../types";

export class UIModule implements ScriptModule {
    register(lua: LuaEngine, scope: StateScope, ctx: ScriptContext): void {
        lua.global.set(
            "__uiSetPropertyJS",
            (targetNameOrId: string, prop: string, val: any) => {
                const entity = ctx
                    .getEntities()
                    .find(
                        (e) =>
                            e.id === targetNameOrId ||
                            e.name === targetNameOrId,
                    );
                if (!entity) return false;
                const uiComp = entity.components.find((c) => c.name === "UI");
                if (!uiComp || !uiComp.data[prop]) return false;
                uiComp.data[prop].value = val;
                uiComp.data[prop].dirty = true;
                return true;
            },
        );

        lua.global.set(
            "__uiGetPropertyJS",
            (targetNameOrId: string, prop: string) => {
                const entity = ctx
                    .getEntities()
                    .find(
                        (e) =>
                            e.id === targetNameOrId ||
                            e.name === targetNameOrId,
                    );
                if (!entity) return null;
                const uiComp = entity.components.find((c) => c.name === "UI");
                if (!uiComp || !uiComp.data[prop]) return null;
                return uiComp.data[prop].value;
            },
        );

        lua.global.set(
            "__uiOnClickJS",
            (targetNameOrId: string, callbackId: string) => {
                const entity = ctx
                    .getEntities()
                    .find(
                        (e) =>
                            e.id === targetNameOrId ||
                            e.name === targetNameOrId,
                    );
                if (!entity) return undefined;
                const dispatch = (...args: any[]) => {
                    ctx.dispatchCallback(
                        scope,
                        callbackId,
                        args,
                        `${entity.name}.UI.click`,
                    );
                };
                const listenerId = entity.events.on("UI.click", dispatch, scope);
                scope.registrations.push({
                    emitter: entity.events,
                    listenerId,
                });
                return listenerId;
            },
        );

        lua.doStringSync(`
            UI = {
                setText = function(target, text)
                    return __uiSetPropertyJS(target, "text", tostring(text))
                end,
                getText = function(target)
                    return __uiGetPropertyJS(target, "text") or ""
                end,
                setColor = function(target, color)
                    return __uiSetPropertyJS(target, "color", tostring(color))
                end,
                setBackgroundColor = function(target, color)
                    return __uiSetPropertyJS(target, "backgroundColor", tostring(color))
                end,
                setVisible = function(target, visible)
                    return __uiSetPropertyJS(target, "visible", visible and true or false)
                end,
                onClick = function(target, callback)
                    local callbackId = __registerEventCallback(callback)
                    return __uiOnClickJS(target, callbackId)
                end
            }
        `);
    }
}
