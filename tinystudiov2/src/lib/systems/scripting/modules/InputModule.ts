import type { LuaEngine } from "wasmoon";
import type { StateScope } from "../../ScriptScheduler";
import type { ScriptContext, ScriptModule } from "../types";

export class InputModule implements ScriptModule {
    register(lua: LuaEngine, scope: StateScope, ctx: ScriptContext): void {
        lua.global.set("__isKeyPressedJS", (keyCode: string) => {
            return ctx.getKeysPressed().has(keyCode);
        });

        lua.global.set("__isMouseButtonDownJS", (button: number) => {
            return ctx.getMouseButtons().has(button);
        });

        lua.global.set("__getMousePositionJS", () => {
            const p = ctx.getMousePosition();
            return [p.x, p.y];
        });

        lua.global.set("__getMouseDeltaJS", () => {
            const d = ctx.getMouseDelta();
            return [d.x, d.y];
        });

        lua.global.set("__getScrollJS", () => {
            return ctx.getScrollY();
        });

        lua.global.set(
            "__inputManagerOn",
            (eventName: string, callbackId: string) => {
                const dispatch = (...args: any[]) => {
                    ctx.dispatchCallback(
                        scope,
                        callbackId,
                        args,
                        `inputManager.${eventName}`,
                    );
                };
                const emitter = ctx.getInputEvents();
                const listenerId = emitter.on(eventName, dispatch, scope);
                scope.registrations.push({
                    emitter,
                    listenerId,
                });
                return listenerId;
            },
        );

        lua.global.set("__inputManagerOff", (id: string) => {
            scope.removeRegistration(id);
        });

        lua.doStringSync(`
            if not game then game = {} end

            game.inputManager = {
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
            }

            Input = game.inputManager
            Input.isKeyDown = function(keyCode) return __isKeyPressedJS(keyCode) end
        `);
    }
}
