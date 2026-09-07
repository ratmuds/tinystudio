import type { LuaEngine } from "wasmoon";
import type { Entity } from "$lib/stores/ecs.svelte";
import type { EventEmitter } from "$lib/stores/EventEmitter";
import type { StateScope } from "../ScriptScheduler";

export interface ScriptContext {
    getEntities(): Entity[];
    removeEntity(id: string): void;
    getKeysPressed(): Set<string>;
    getMouseButtons(): Set<number>;
    getMousePosition(): { x: number; y: number };
    getMouseDelta(): { x: number; y: number };
    getScrollY(): number;
    getInputEvents(): EventEmitter;
    dispatchCallback(
        scope: StateScope,
        callbackId: string,
        args: any[],
        name: string,
    ): void;
}

export interface ScriptModule {
    register(lua: LuaEngine, scope: StateScope, ctx: ScriptContext): void;
}
