export interface ExecEvent {
    timestamp: number;
    duration: number;
}

export interface JobMetrics {
    id: string;
    name: string;
    type: "script" | "callback" | "other";
    status: "alive" | "dead" | "queued" | "running" | "sleeping";
    nextExec: number;
    lastExecTime: number;
    avgRunTime: number;
    runTimes: number[];
    isPrimary: boolean;
    execHistory: ExecEvent[];
}

export interface ScopeMetrics {
    entityId: string;
    entityName: string;
    jobs: JobMetrics[];
    totalJobs: number;
    aliveJobs: number;
    deadJobs: number;
    primaryDead: boolean;
}

const HIGH_LOAD_THRESHOLD_MS = 5;
const HISTORY_LIMIT = 60;

export class RuntimeMetrics {
    scopes = $state<ScopeMetrics[]>([]);

    totalScopes = $derived(this.scopes.length);
    totalJobs = $derived(this.scopes.reduce((sum, s) => sum + s.totalJobs, 0));
    totalAliveJobs = $derived(
        this.scopes.reduce((sum, s) => sum + s.aliveJobs, 0),
    );

    globalAvgRunTime = $derived.by(() => {
        let total = 0;
        let count = 0;
        for (const scope of this.scopes) {
            for (const job of scope.jobs) {
                if (job.avgRunTime > 0) {
                    total += job.avgRunTime;
                    count++;
                }
            }
        }
        return count > 0 ? total / count : 0;
    });

    globalLoad = $derived(
        Math.min(1, this.globalAvgRunTime / HIGH_LOAD_THRESHOLD_MS),
    );

    highLoadJobs = $derived.by(() => {
        const jobs: { job: JobMetrics; scope: ScopeMetrics }[] = [];
        for (const scope of this.scopes) {
            for (const job of scope.jobs) {
                if (job.avgRunTime > HIGH_LOAD_THRESHOLD_MS) {
                    jobs.push({ job, scope });
                }
            }
        }
        return jobs;
    });

    isHighLoad = $derived(this.highLoadJobs.length > 0);

    loadHistory = $state<number[]>([]);

    updateScope(
        entityId: string,
        entityName: string,
        jobs: JobMetrics[],
        primaryDead: boolean,
    ) {
        const aliveJobs = jobs.filter((j) => j.status !== "dead").length;
        const deadJobs = jobs.filter((j) => j.status === "dead").length;
        const existing = this.scopes.findIndex((s) => s.entityId === entityId);
        const scope: ScopeMetrics = {
            entityId,
            entityName,
            jobs,
            totalJobs: jobs.length,
            aliveJobs,
            deadJobs,
            primaryDead,
        };
        if (existing >= 0) {
            this.scopes[existing] = scope;
        } else {
            this.scopes.push(scope);
        }
    }

    recordLoad() {
        this.loadHistory.push(this.globalLoad);
        if (this.loadHistory.length > HISTORY_LIMIT) {
            this.loadHistory.shift();
        }
    }

    removeScope(entityId: string) {
        this.scopes = this.scopes.filter((s) => s.entityId !== entityId);
    }

    clear() {
        this.scopes = [];
        this.loadHistory = [];
    }
}

export const runtimeMetrics = new RuntimeMetrics();