import { LuaReturn, type LuaEngine, type LuaThread } from "wasmoon";
import type { ExecEvent, JobMetrics } from "$lib/stores/runtimeMetrics.svelte";
import type { Entity } from "$lib/stores/ecs.svelte";
import type { EventEmitter } from "$lib/stores/EventEmitter";

const MAX_RUN_TIMES = 60;
const MAX_EXEC_HISTORY = 60;

export interface Registration {
    emitter: EventEmitter;
    listenerId: string;
}

interface PendingDispatch {
    callback: Function;
    args: any[];
}

export class SchedulerJob {
    id: string;
    thread: LuaThread;
    nextExec: number;
    state: "alive" | "dead" | "queued" | "running" | "sleeping";
    type: "script" | "callback" | "other";
    args: any[];
    name: string;

    lastExec: number;
    lastRunTime: number;
    runTimes: number[];
    isPrimary: boolean;
    execHistory: ExecEvent[];

    constructor(
        id: string,
        thread: LuaThread,
        nextExec: number,
        state: "alive" | "dead" | "queued" | "running" | "sleeping",
        type: "script" | "callback" | "other",
        args: any[],
        name?: string,
    ) {
        this.id = id;
        this.thread = thread;
        this.nextExec = nextExec;
        this.state = state;
        this.type = type;
        this.args = args;
        this.name = name ?? id.slice(0, 8);

        this.lastExec = 0;
        this.lastRunTime = 0;
        this.runTimes = [];
        this.isPrimary = type === "script";
        this.execHistory = [];
    }

    get avgRunTime(): number {
        if (this.runTimes.length === 0) return 0;
        return this.runTimes.reduce((a, b) => a + b, 0) / this.runTimes.length;
    }

    recordRun(duration: number) {
        this.lastRunTime = duration;
        this.runTimes.push(duration);
        if (this.runTimes.length > MAX_RUN_TIMES) {
            this.runTimes.shift();
        }
        this.execHistory.push({ timestamp: Date.now(), duration });
        if (this.execHistory.length > MAX_EXEC_HISTORY) {
            this.execHistory.shift();
        }
    }

    toMetrics(): JobMetrics {
        return {
            id: this.id,
            name: this.name,
            type: this.type,
            status: this.state,
            nextExec: this.nextExec,
            lastExecTime: this.lastRunTime,
            avgRunTime: this.avgRunTime,
            runTimes: [...this.runTimes],
            isPrimary: this.isPrimary,
            execHistory: [...this.execHistory],
        };
    }
}

export class StateScope {
    lua: LuaEngine;
    entityId: string;
    entityName: string;
    jobs: SchedulerJob[];
    pendingJobs: SchedulerJob[];
    pendingDispatches: PendingDispatch[];
    mainJob: string | null;
    primaryDead: boolean;
    registrations: Registration[];

    constructor(lua: LuaEngine, entityId: string, entityName: string) {
        this.lua = lua;
        this.entityId = entityId;
        this.entityName = entityName;
        this.jobs = [];
        this.pendingJobs = [];
        this.pendingDispatches = [];
        this.mainJob = null;
        this.primaryDead = false;
        this.registrations = [];
    }

    addJob(job: SchedulerJob) {
        this.jobs.push(job);
        if (job.isPrimary) {
            this.mainJob = job.id;
        }
    }

    schedule(callback: Function, args: any[]) {
        // Do not enter Lua while an event is being emitted from Lua/wasm.
        // Dispatch is deferred until the scheduler is outside that call stack.
        this.pendingDispatches.push({ callback, args });
    }

    removeRegistration(listenerId: string) {
        const idx = this.registrations.findIndex(r => r.listenerId === listenerId);
        if (idx >= 0) {
            const reg = this.registrations[idx];
            reg.emitter.off(reg.listenerId);
            this.registrations.splice(idx, 1);
        }
    }

    clearRegistrations() {
        for (const reg of this.registrations) {
            reg.emitter.off(reg.listenerId);
        }
        this.registrations = [];
    }

    getMetrics(): JobMetrics[] {
        return this.jobs.map(j => j.toMetrics());
    }

    step() {
        if (this.pendingDispatches.length > 0) {
            const dispatches = this.pendingDispatches;
            this.pendingDispatches = [];
            for (const pending of dispatches) {
                pending.callback(...pending.args);
            }
        }

        // Merge pending jobs into the queue
        if (this.pendingJobs.length > 0) {
            this.jobs.push(...this.pendingJobs);
            this.pendingJobs = [];
        }

        const now = Date.now();

        for (const job of this.jobs) {
            if (job.state === "dead") continue;
            if (job.nextExec > now) {
                if (job.state !== "running") job.state = "sleeping";
                continue;
            }

            job.state = "running";
            const start = performance.now();

            let result: LuaReturn;
            let resultCount: number;
            try {
                // Wasmoon resume takes an argument count. The values must be
                // pushed onto the coroutine stack before resuming it.
                for (const arg of job.args) {
                    job.thread.pushValue(arg);
                }
                ({ result, resultCount } = job.thread.resume(job.args.length));
                job.args = [];
            } catch (error) {
                console.error(
                    `[Lua Runtime Error on Job "${job.name}" (${job.id})]`,
                    extractLuaError(error),
                );
                job.args = [];
                job.state = "dead";
                if (job.isPrimary) {
                    this.primaryDead = true;
                }
                continue;
            }

            const duration = performance.now() - start;
            job.recordRun(duration);
            job.lastExec = now;

            if (result === LuaReturn.Ok) {
                job.state = "dead";
                if (job.isPrimary) {
                    this.primaryDead = true;
                }
                continue;
            }

            if (result !== LuaReturn.Yield) {
                let errorMsg = "Unknown error";
                try {
                    const stackVal = job.thread.getStackValues(-1);
                    if (stackVal !== undefined && stackVal !== null) {
                        errorMsg = extractLuaError(stackVal);
                    }
                } catch (e) {
                    errorMsg = `Could not inspect stack error: ${e}`;
                }

                console.error(
                    `[Lua Runtime Error on Job "${job.name}" (${job.id})]`,
                    errorMsg,
                );
                job.thread.pop(resultCount);
                job.state = "dead";
                if (job.isPrimary) {
                    this.primaryDead = true;
                }
                continue;
            }

            // Yielded — read wait time
            let waitSeconds = 0;
            if (resultCount > 0) {
                const [first] = job.thread.getStackValues(0);
                if (typeof first === "number") waitSeconds = first;
                job.thread.pop(resultCount);
            }

            if (waitSeconds > 0) {
                job.nextExec = now + waitSeconds * 1000;
                job.state = "sleeping";
            } else {
                job.nextExec = 0;
                job.state = "alive";
            }
        }

        // Remove dead jobs that aren't primary (keep primary for metrics visibility)
        this.jobs = this.jobs.filter(j => j.state !== "dead" || j.isPrimary);
    }
}

function extractLuaError(raw: unknown): string {
    const str = String(raw);
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
