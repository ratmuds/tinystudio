<script lang="ts">
    import * as Popover from "$lib/components/ui/popover/index.js";
    import * as Tabs from "$lib/components/ui/tabs/index.js";
    import {
        Activity,
        Cpu,
        Clock,
        Zap,
        CircleDot,
        Timer,
        Skull,
        Moon,
        Play,
        ChevronDown,
        ChevronRight,
        Layers,
        AlertTriangle,
        TrendingUp,
        BarChart3,
    } from "@lucide/svelte";
    import {
        runtimeMetrics,
        type JobMetrics,
        type ScopeMetrics,
    } from "$lib/stores/runtimeMetrics.svelte";

    let expandedScopes = $state<Set<string>>(new Set());
    let activeTab = $state("overview");

    function toggleScope(entityId: string) {
        const next = new Set(expandedScopes);
        if (next.has(entityId)) next.delete(entityId);
        else next.add(entityId);
        expandedScopes = next;
    }

    function statusColor(status: JobMetrics["status"]): string {
        switch (status) {
            case "alive":
                return "bg-green-500/15 text-green-400 border-green-500/25";
            case "running":
                return "bg-blue-500/15 text-blue-400 border-blue-500/25";
            case "sleeping":
                return "bg-amber-500/15 text-amber-400 border-amber-500/25";
            case "queued":
                return "bg-purple-500/15 text-purple-400 border-purple-500/25";
            case "dead":
                return "bg-red-500/15 text-red-400 border-red-500/25";
            default:
                return "bg-muted text-muted-foreground";
        }
    }

    function statusDot(status: JobMetrics["status"]): string {
        switch (status) {
            case "alive":
                return "bg-green-500";
            case "running":
                return "bg-blue-500";
            case "sleeping":
                return "bg-amber-500";
            case "queued":
                return "bg-purple-500";
            case "dead":
                return "bg-red-500";
            default:
                return "bg-muted-foreground";
        }
    }

    function formatMs(ms: number): string {
        if (ms <= 0) return "0ms";
        if (ms < 0.01) return "<0.01ms";
        if (ms < 1) return ms.toFixed(2) + "ms";
        return ms.toFixed(1) + "ms";
    }

    function formatNextExec(timestamp: number): string {
        if (timestamp <= 0) return "now";
        const delta = timestamp - Date.now();
        if (delta <= 0) return "now";
        if (delta < 1000) return Math.round(delta) + "ms";
        return (delta / 1000).toFixed(1) + "s";
    }

    const HIGH_LOAD_MS = 5;

    function isHighLoad(job: JobMetrics): boolean {
        return job.avgRunTime > HIGH_LOAD_MS;
    }

    function arcPath(
        cx: number,
        cy: number,
        r: number,
        startAngle: number,
        endAngle: number,
    ): string {
        const x1 = cx + r * Math.cos(startAngle);
        const y1 = cy + r * Math.sin(startAngle);
        const x2 = cx + r * Math.cos(endAngle);
        const y2 = cy + r * Math.sin(endAngle);
        const large = endAngle - startAngle > Math.PI ? 1 : 0;
        return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
    }

    function sparklinePath(
        runTimes: number[],
        width: number,
        height: number,
    ): string {
        if (runTimes.length < 2) return "";
        const max = Math.max(...runTimes, 0.01);
        const step = width / (runTimes.length - 1);
        const points = runTimes.map((v, i) => {
            const x = i * step;
            const y = height - (v / max) * (height - 2) - 1;
            return `${x},${y}`;
        });
        return `M${points.join(" L")}`;
    }

    function sparklineArea(
        runTimes: number[],
        width: number,
        height: number,
    ): string {
        if (runTimes.length < 2) return "";
        const max = Math.max(...runTimes, 0.01);
        const step = width / (runTimes.length - 1);
        const points = runTimes.map((v, i) => {
            const x = i * step;
            const y = height - (v / max) * (height - 2) - 1;
            return `${x},${y}`;
        });
        return `M0,${height} L${points.join(" L")} L${width},${height} Z`;
    }

    function loadColor(load: number): string {
        if (load > 0.8) return "#ef4444";
        if (load > 0.5) return "#f59e0b";
        if (load > 0.2) return "#3b82f6";
        return "#22c55e";
    }

    function loadHistoryPath(
        hist: number[],
        width: number,
        height: number,
    ): string {
        if (hist.length < 2) return "";
        const step = width / Math.max(hist.length - 1, 1);
        return hist
            .map((v, i) => `${i * step},${height - v * (height - 4) - 2}`)
            .join(" L");
    }

    function loadHistoryAreaPath(
        hist: number[],
        width: number,
        height: number,
    ): string {
        if (hist.length < 2) return "";
        return `M0,${height} L${loadHistoryPath(hist, width, height)} L${width},${height} Z`;
    }

    function threadThresholdY(runTimes: number[], height: number): number {
        const maxVal = Math.max(...runTimes, 0.01);
        return height - (HIGH_LOAD_MS / maxVal) * (height - 2) - 1;
    }

    function gradientId(id: string): string {
        return `spark-grad-${id.replace(/[^a-zA-Z0-9]/g, "")}`;
    }

    const load = $derived(runtimeMetrics.globalLoad);
    const loadColorValue = $derived(loadColor(load));
    const isHighLoadGlobal = $derived(runtimeMetrics.isHighLoad);

    const loadThresholdLine = $derived(
        60 - 60 * (HIGH_LOAD_MS / (HIGH_LOAD_MS * 2)),
    );

    const watermarkJobs = $derived(
        runtimeMetrics.scopes.flatMap((s) =>
            s.jobs.map((j) => ({ job: j, scope: s })),
        ),
    );

    const allHistory = $derived(
        watermarkJobs.flatMap(({ job, scope }) =>
            job.execHistory.map((e) => ({
                ...e,
                jobName: job.name,
                scopeName: scope.entityName,
                isHigh: job.avgRunTime > HIGH_LOAD_MS,
            })),
        ),
    );

    const waterfallData = $derived.by(() => {
        const sorted = [...allHistory].sort(
            (a, b) => a.timestamp - b.timestamp,
        );
        return sorted.slice(-50).reverse();
    });

    const maxWaterfallDur = $derived(
        Math.max(...allHistory.map((e) => e.duration), 0.1),
    );
</script>

<Popover.Root>
    <Popover.Trigger
        class="relative flex items-center gap-1.5 rounded-md border border-border/60 bg-background px-2.5 py-1.5 transition-colors duration-150 hover:bg-muted/60"
    >
        <!-- Radial load gauge -->
        <div class="relative h-5 w-5">
            <svg viewBox="0 0 24 24" class="absolute inset-0">
                <circle
                    cx="12"
                    cy="12"
                    r="9"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2.5"
                    class="text-muted/30"
                />
                <circle
                    cx="12"
                    cy="12"
                    r="9"
                    fill="none"
                    stroke={loadColorValue}
                    stroke-width="2.5"
                    stroke-linecap="round"
                    stroke-dasharray={2 * Math.PI * 9}
                    stroke-dashoffset={2 * Math.PI * 9 * (1 - load)}
                    transform="rotate(-90 12 12)"
                    class="transition-all duration-300"
                />
            </svg>
        </div>
        {#if isHighLoadGlobal}
            <AlertTriangle class="h-3.5 w-3.5 text-red-400 " />
        {/if}
        <span
            class="text-xs font-medium {isHighLoadGlobal
                ? 'text-red-400'
                : 'text-muted-foreground'}">Scheduler</span
        >
    </Popover.Trigger>
    <Popover.Content
        class="max-h-[600px] w-[560px] overflow-hidden p-0"
        align="start"
        side="bottom"
    >
        <!-- Header -->
        <div
            class="flex items-center justify-between border-b border-border/60 bg-muted/30 px-4 py-3"
        >
            <div class="flex items-center gap-2.5">
                <div class="relative">
                    <Cpu class="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                    <h3 class="text-sm leading-tight font-bold text-foreground">
                        Scheduler
                    </h3>
                    <p class="text-[10px] text-muted-foreground">
                        {runtimeMetrics.totalScopes} scope{runtimeMetrics.totalScopes !==
                        1
                            ? "s"
                            : ""} · {runtimeMetrics.totalJobs} job{runtimeMetrics.totalJobs !==
                        1
                            ? "s"
                            : ""}
                    </p>
                </div>
            </div>
            <div class="flex items-center gap-3">
                <div
                    class="flex items-center gap-1.5 rounded-md bg-muted px-2.5 py-1"
                >
                    <div
                        class="h-1.5 w-1.5 rounded-full {runtimeMetrics.totalAliveJobs >
                        0
                            ? 'bg-green-500 '
                            : 'bg-muted-foreground'}"
                    ></div>
                    <span class="text-[10px] font-medium text-muted-foreground">
                        {runtimeMetrics.totalAliveJobs > 0 ? "Active" : "Idle"}
                    </span>
                </div>
                {#if runtimeMetrics.globalAvgRunTime > 0}
                    <div
                        class="flex items-center gap-1 text-[10px] text-muted-foreground"
                    >
                        <Timer class="h-3 w-3" />
                        avg {formatMs(runtimeMetrics.globalAvgRunTime)}
                    </div>
                {/if}
            </div>
        </div>

        <!-- High load banner -->
        {#if isHighLoadGlobal}
            <div
                class="flex items-center gap-2 border-b border-red-500/20 bg-red-500/5 px-4 py-2"
            >
                <AlertTriangle class="h-3.5 w-3.5 shrink-0 text-red-400" />
                <span class="text-[11px] font-medium text-red-400">
                    High load detected
                </span>
                <span class="text-[10px] text-muted-foreground">
                    {runtimeMetrics.highLoadJobs.length} job{runtimeMetrics
                        .highLoadJobs.length !== 1
                        ? "s"
                        : ""} exceeding {HIGH_LOAD_MS}ms avg
                </span>
            </div>
        {/if}

        <!-- Tabs -->
        <Tabs.Root bind:value={activeTab} class="w-full">
            <Tabs.List
                class="grid h-auto w-full grid-cols-3 rounded-none border-b border-border/60 bg-transparent p-0"
            >
                <Tabs.Trigger
                    value="overview"
                    class="flex items-center justify-center gap-1.5 rounded-none border-b-2 border-transparent py-2.5 text-[11px] font-medium {activeTab ===
                    'overview'
                        ? 'border-foreground text-foreground'
                        : 'text-muted-foreground hover:text-foreground'}"
                >
                    <BarChart3 class="h-3 w-3" />
                    Overview
                </Tabs.Trigger>
                <Tabs.Trigger
                    value="timeline"
                    class="flex items-center justify-center gap-1.5 rounded-none border-b-2 border-transparent py-2.5 text-[11px] font-medium {activeTab ===
                    'timeline'
                        ? 'border-foreground text-foreground'
                        : 'text-muted-foreground hover:text-foreground'}"
                >
                    <TrendingUp class="h-3 w-3" />
                    Timeline
                </Tabs.Trigger>
                <Tabs.Trigger
                    value="threads"
                    class="flex items-center justify-center gap-1.5 rounded-none border-b-2 border-transparent py-2.5 text-[11px] font-medium {activeTab ===
                    'threads'
                        ? 'border-foreground text-foreground'
                        : 'text-muted-foreground hover:text-foreground'}"
                >
                    <Layers class="h-3 w-3" />
                    Threads
                </Tabs.Trigger>
            </Tabs.List>

            <!-- Overview Tab -->
            <Tabs.Content
                value="overview"
                class="mt-0 p-4 focus-visible:outline-none"
            >
                {#if runtimeMetrics.scopes.length === 0}
                    <div
                        class="flex flex-col items-center justify-center py-10 text-muted-foreground"
                    >
                        <Cpu class="mb-2 h-8 w-8 opacity-30" />
                        <p class="text-xs">No active scopes</p>
                        <p class="text-[10px] opacity-60">
                            Start a runtime to see scheduler data
                        </p>
                    </div>
                {:else}
                    <!-- Stat cards -->
                    <div class="mb-4 grid grid-cols-3 gap-2">
                        <div
                            class="relative overflow-hidden rounded-lg border border-border/60 bg-muted/20 p-3"
                        >
                            <div
                                class="mb-1 flex items-center gap-1.5 text-muted-foreground"
                            >
                                <Layers class="h-3 w-3" />
                                <span
                                    class="text-[10px] tracking-wider uppercase"
                                    >Scopes</span
                                >
                            </div>
                            <p class="text-xl font-bold text-foreground">
                                {runtimeMetrics.totalScopes}
                            </p>
                        </div>
                        <div
                            class="relative overflow-hidden rounded-lg border border-border/60 bg-muted/20 p-3"
                        >
                            <div
                                class="mb-1 flex items-center gap-1.5 text-muted-foreground"
                            >
                                <Zap class="h-3 w-3" />
                                <span
                                    class="text-[10px] tracking-wider uppercase"
                                    >Jobs</span
                                >
                            </div>
                            <p class="text-xl font-bold text-foreground">
                                <span class="text-green-400"
                                    >{runtimeMetrics.totalAliveJobs}</span
                                >
                                <span class="text-sm text-muted-foreground"
                                    >/{runtimeMetrics.totalJobs}</span
                                >
                            </p>
                        </div>
                        <div
                            class="relative overflow-hidden rounded-lg border border-border/60 bg-muted/20 p-3"
                        >
                            <div
                                class="mb-1 flex items-center gap-1.5 text-muted-foreground"
                            >
                                <Timer class="h-3 w-3" />
                                <span
                                    class="text-[10px] tracking-wider uppercase"
                                    >Avg Run</span
                                >
                            </div>
                            <p
                                class="text-xl font-bold {isHighLoadGlobal
                                    ? 'text-red-400'
                                    : 'text-foreground'}"
                            >
                                {formatMs(runtimeMetrics.globalAvgRunTime)}
                            </p>
                        </div>
                    </div>

                    <!-- Load history graph -->
                    <div
                        class="mb-4 rounded-lg border border-border/60 bg-muted/20 p-3"
                    >
                        <div class="mb-2 flex items-center justify-between">
                            <span
                                class="text-[10px] font-medium tracking-wider text-muted-foreground uppercase"
                                >Load History</span
                            >
                            <span class="text-[10px] text-muted-foreground"
                                >last {runtimeMetrics.loadHistory.length} frames</span
                            >
                        </div>
                        {#if runtimeMetrics.loadHistory.length > 1}
                            <svg
                                viewBox="0 0 500 60"
                                class="h-12 w-full"
                                preserveAspectRatio="none"
                            >
                                <defs>
                                    <linearGradient
                                        id="loadGrad"
                                        x1="0"
                                        y1="0"
                                        x2="0"
                                        y2="1"
                                    >
                                        <stop
                                            offset="0%"
                                            stop-color={loadColorValue}
                                            stop-opacity="0.4"
                                        />
                                        <stop
                                            offset="100%"
                                            stop-color={loadColorValue}
                                            stop-opacity="0"
                                        />
                                    </linearGradient>
                                </defs>
                                <line
                                    x1="0"
                                    y1={loadThresholdLine}
                                    x2="500"
                                    y2={loadThresholdLine}
                                    stroke="#ef4444"
                                    stroke-width="0.5"
                                    stroke-dasharray="2 2"
                                    opacity="0.3"
                                />
                                <path
                                    d={loadHistoryAreaPath(
                                        runtimeMetrics.loadHistory,
                                        500,
                                        60,
                                    )}
                                    fill="url(#loadGrad)"
                                />
                                <path
                                    d={loadHistoryPath(
                                        runtimeMetrics.loadHistory,
                                        500,
                                        60,
                                    )}
                                    fill="none"
                                    stroke={loadColorValue}
                                    stroke-width="1.5"
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                />
                            </svg>
                        {:else}
                            <div
                                class="flex h-12 items-center justify-center text-[10px] text-muted-foreground opacity-50"
                            >
                                Collecting data...
                            </div>
                        {/if}
                    </div>

                    <!-- Scope cards -->
                    <div class="space-y-2">
                        {#each runtimeMetrics.scopes as scope (scope.entityId)}
                            <div
                                class="overflow-hidden rounded-lg border border-border/60 bg-muted/10"
                            >
                                <button
                                    class="flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-muted/20"
                                    onclick={() => toggleScope(scope.entityId)}
                                >
                                    {#if expandedScopes.has(scope.entityId)}
                                        <ChevronDown
                                            class="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                                        />
                                    {:else}
                                        <ChevronRight
                                            class="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                                        />
                                    {/if}
                                    <div
                                        class="flex h-6 w-6 items-center justify-center rounded-md bg-blue-500/15"
                                    >
                                        <Cpu
                                            class="h-3.5 w-3.5 text-blue-400"
                                        />
                                    </div>
                                    <div class="min-w-0 flex-1">
                                        <p
                                            class="truncate text-xs font-semibold text-foreground"
                                        >
                                            {scope.entityName}
                                        </p>
                                    </div>
                                    <div class="flex items-center gap-2">
                                        {#if scope.primaryDead}
                                            <span
                                                class="rounded border border-red-500/25 bg-red-500/10 px-1.5 py-0.5 text-[9px] font-medium text-red-400"
                                            >
                                                primary done
                                            </span>
                                        {/if}
                                        <!-- Mini stacked bar showing job states -->
                                        <div
                                            class="flex h-4 gap-px overflow-hidden rounded"
                                        >
                                            {#each scope.jobs as job}
                                                <div
                                                    class="w-1.5 {statusDot(
                                                        job.status,
                                                    )} {job.status === 'dead'
                                                        ? 'opacity-30'
                                                        : ''}"
                                                    title={job.name +
                                                        ": " +
                                                        job.status}
                                                ></div>
                                            {/each}
                                        </div>
                                    </div>
                                </button>

                                {#if expandedScopes.has(scope.entityId)}
                                    <div
                                        class="space-y-1 border-t border-border/30 bg-muted/5 px-3 py-2"
                                    >
                                        {#each scope.jobs as job (job.id)}
                                            <div
                                                class="flex items-center gap-2 rounded px-1 py-1 {isHighLoad(
                                                    job,
                                                )
                                                    ? ' rounded border border-red-500/20 bg-red-500/5'
                                                    : ''}"
                                            >
                                                <div
                                                    class="h-1.5 w-1.5 rounded-full {statusDot(
                                                        job.status,
                                                    )} shrink-0"
                                                ></div>
                                                <span
                                                    class="flex-1 truncate text-[11px] font-medium text-foreground"
                                                    >{job.name}</span
                                                >
                                                {#if job.isPrimary}
                                                    <span
                                                        class="rounded border border-blue-500/25 bg-blue-500/10 px-1 py-0 text-[8px] font-medium text-blue-400"
                                                        >MAIN</span
                                                    >
                                                {/if}
                                                <span
                                                    class="rounded border px-1.5 py-0 text-[9px] font-medium {statusColor(
                                                        job.status,
                                                    )}">{job.status}</span
                                                >
                                                {#if job.avgRunTime > 0}
                                                    <span
                                                        class="text-[10px] {isHighLoad(
                                                            job,
                                                        )
                                                            ? 'font-bold text-red-400'
                                                            : 'text-muted-foreground'} w-12 text-right"
                                                        >{formatMs(
                                                            job.avgRunTime,
                                                        )}</span
                                                    >
                                                {/if}
                                                {#if job.runTimes.length > 1}
                                                    <svg
                                                        width="40"
                                                        height="14"
                                                        class="shrink-0"
                                                    >
                                                        <path
                                                            d={sparklineArea(
                                                                job.runTimes,
                                                                40,
                                                                14,
                                                            )}
                                                            fill={isHighLoad(
                                                                job,
                                                            )
                                                                ? "#ef444422"
                                                                : "#22c55e22"}
                                                        />
                                                        <path
                                                            d={sparklinePath(
                                                                job.runTimes,
                                                                40,
                                                                14,
                                                            )}
                                                            fill="none"
                                                            stroke={isHighLoad(
                                                                job,
                                                            )
                                                                ? "#ef4444"
                                                                : "#22c55e"}
                                                            stroke-width="1"
                                                            stroke-linecap="round"
                                                            stroke-linejoin="round"
                                                        />
                                                    </svg>
                                                {:else}
                                                    <div
                                                        class="w-10 shrink-0"
                                                    ></div>
                                                {/if}
                                            </div>
                                        {/each}
                                    </div>
                                {/if}
                            </div>
                        {/each}
                    </div>
                {/if}
            </Tabs.Content>

            <!-- Timeline Tab (Waterfall) -->
            <Tabs.Content
                value="timeline"
                class="mt-0 p-4 focus-visible:outline-none"
            >
                {#if runtimeMetrics.scopes.length === 0}
                    <div
                        class="flex flex-col items-center justify-center py-10 text-muted-foreground"
                    >
                        <TrendingUp class="mb-2 h-8 w-8 opacity-30" />
                        <p class="text-xs">No timeline data</p>
                    </div>
                {:else if allHistory.length === 0}
                    <div
                        class="flex flex-col items-center justify-center py-10 text-muted-foreground"
                    >
                        <Clock class="mb-2 h-8 w-8 opacity-30" />
                        <p class="text-xs">No execution events yet</p>
                        <p class="mt-1 text-[10px] opacity-60">
                            Waterfall will appear as jobs run
                        </p>
                    </div>
                {:else}
                    <div class="mb-2 flex items-center justify-between">
                        <span
                            class="text-[10px] font-medium tracking-wider text-muted-foreground uppercase"
                            >Waterfall Timeline</span
                        >
                        <span class="text-[10px] text-muted-foreground"
                            >{allHistory.length} events</span
                        >
                    </div>
                    <div
                        class="max-h-[320px] space-y-0.5 overflow-y-auto rounded-lg border border-border/60 bg-muted/10 p-3"
                    >
                        {#each waterfallData as event (event.timestamp + event.jobName)}
                            <div class="group flex items-center gap-2">
                                <span
                                    class="w-20 shrink-0 truncate text-[9px] text-muted-foreground group-hover:text-foreground"
                                    >{event.scopeName}</span
                                >
                                <span
                                    class="w-16 shrink-0 truncate text-[9px] {event.isHigh
                                        ? 'font-medium text-red-400'
                                        : 'text-foreground'}"
                                    >{event.jobName}</span
                                >
                                <div
                                    class="relative h-4 flex-1 overflow-hidden rounded bg-muted/40"
                                >
                                    <div
                                        class="absolute inset-y-0 left-0 rounded {event.isHigh
                                            ? 'bg-red-500/70'
                                            : 'bg-green-500/60'} transition-all"
                                        style="width: {(event.duration /
                                            maxWaterfallDur) *
                                            100}%"
                                    ></div>
                                    <span
                                        class="absolute inset-0 flex items-center justify-end pr-1.5 text-[8px] font-medium text-foreground/80"
                                    >
                                        {formatMs(event.duration)}
                                    </span>
                                </div>
                            </div>
                        {/each}
                    </div>
                    <p
                        class="mt-2 text-center text-[9px] text-muted-foreground/60"
                    >
                        Bar width = relative duration · Red = high load (&gt;{HIGH_LOAD_MS}ms)
                    </p>
                {/if}
            </Tabs.Content>

            <!-- Threads Tab -->
            <Tabs.Content
                value="threads"
                class="mt-0 p-4 focus-visible:outline-none"
            >
                {#if runtimeMetrics.scopes.length === 0}
                    <div
                        class="flex flex-col items-center justify-center py-10 text-muted-foreground"
                    >
                        <Layers class="mb-2 h-8 w-8 opacity-30" />
                        <p class="text-xs">No thread data</p>
                    </div>
                {:else}
                    <div class="max-h-[400px] space-y-3 overflow-y-auto">
                        {#each runtimeMetrics.scopes as scope (scope.entityId)}
                            <div
                                class="overflow-hidden rounded-lg border border-border/60"
                            >
                                <div
                                    class="flex items-center gap-2 border-b border-border/60 bg-muted/20 px-3 py-2"
                                >
                                    <Cpu class="h-3.5 w-3.5 text-blue-400" />
                                    <span
                                        class="flex-1 text-xs font-semibold text-foreground"
                                        >{scope.entityName}</span
                                    >
                                    <span
                                        class="text-[10px] text-muted-foreground"
                                        >{scope.aliveJobs}/{scope.totalJobs} alive</span
                                    >
                                </div>
                                <div class="divide-y divide-border/30">
                                    {#each scope.jobs as job (job.id)}
                                        <div
                                            class="px-3 py-2.5 {isHighLoad(job)
                                                ? 'border-l-2 border-l-red-500 bg-red-500/5 '
                                                : ''}"
                                        >
                                            <div
                                                class="mb-1.5 flex items-center gap-2"
                                            >
                                                {#if job.status === "running"}
                                                    <Play
                                                        class="h-3 w-3 text-blue-400"
                                                    />
                                                {:else if job.status === "sleeping"}
                                                    <Moon
                                                        class="h-3 w-3 text-amber-400"
                                                    />
                                                {:else if job.status === "dead"}
                                                    <Skull
                                                        class="h-3 w-3 text-red-400"
                                                    />
                                                {:else}
                                                    <CircleDot
                                                        class="h-3 w-3 text-green-400"
                                                    />
                                                {/if}
                                                <span
                                                    class="flex-1 truncate text-[11px] font-medium text-foreground"
                                                    >{job.name}</span
                                                >
                                                {#if job.isPrimary}
                                                    <span
                                                        class="rounded border border-blue-500/25 bg-blue-500/10 px-1 py-0 text-[8px] font-medium text-blue-400"
                                                        >MAIN</span
                                                    >
                                                {/if}
                                                <span
                                                    class="rounded border px-1.5 py-0 text-[9px] font-medium {statusColor(
                                                        job.status,
                                                    )}">{job.status}</span
                                                >
                                            </div>
                                            <div
                                                class="ml-5 flex items-center gap-4 text-[10px] text-muted-foreground"
                                            >
                                                {#if job.avgRunTime > 0}
                                                    <span
                                                        class="flex items-center gap-0.5"
                                                    >
                                                        <Timer
                                                            class="h-2.5 w-2.5"
                                                        />
                                                        avg
                                                        <span
                                                            class={isHighLoad(
                                                                job,
                                                            )
                                                                ? "font-bold text-red-400"
                                                                : "text-foreground/80"}
                                                            >{formatMs(
                                                                job.avgRunTime,
                                                            )}</span
                                                        >
                                                    </span>
                                                {/if}
                                                {#if job.lastExecTime > 0}
                                                    <span
                                                        >last {formatMs(
                                                            job.lastExecTime,
                                                        )}</span
                                                    >
                                                {/if}
                                                {#if job.status === "sleeping"}
                                                    <span
                                                        class="flex items-center gap-0.5"
                                                    >
                                                        <Clock
                                                            class="h-2.5 w-2.5"
                                                        />
                                                        wake {formatNextExec(
                                                            job.nextExec,
                                                        )}
                                                    </span>
                                                {/if}
                                            </div>
                                            {#if job.runTimes.length > 1}
                                                <div class="mt-1.5 ml-5">
                                                    <svg
                                                        width="200"
                                                        height="24"
                                                        class="overflow-visible"
                                                    >
                                                        <defs>
                                                            <linearGradient
                                                                id={gradientId(
                                                                    job.id,
                                                                )}
                                                                x1="0"
                                                                y1="0"
                                                                x2="0"
                                                                y2="1"
                                                            >
                                                                <stop
                                                                    offset="0%"
                                                                    stop-color={isHighLoad(
                                                                        job,
                                                                    )
                                                                        ? "#ef4444"
                                                                        : "#22c55e"}
                                                                    stop-opacity="0.3"
                                                                />
                                                                <stop
                                                                    offset="100%"
                                                                    stop-color={isHighLoad(
                                                                        job,
                                                                    )
                                                                        ? "#ef4444"
                                                                        : "#22c55e"}
                                                                    stop-opacity="0"
                                                                />
                                                            </linearGradient>
                                                        </defs>
                                                        <path
                                                            d={sparklineArea(
                                                                job.runTimes,
                                                                200,
                                                                24,
                                                            )}
                                                            fill={`url(#${gradientId(job.id)})`}
                                                        />
                                                        <path
                                                            d={sparklinePath(
                                                                job.runTimes,
                                                                200,
                                                                24,
                                                            )}
                                                            fill="none"
                                                            stroke={isHighLoad(
                                                                job,
                                                            )
                                                                ? "#ef4444"
                                                                : "#22c55e"}
                                                            stroke-width="1.5"
                                                            stroke-linecap="round"
                                                            stroke-linejoin="round"
                                                        />
                                                        <line
                                                            x1="0"
                                                            y1={threadThresholdY(
                                                                job.runTimes,
                                                                24,
                                                            )}
                                                            x2="200"
                                                            y2={threadThresholdY(
                                                                job.runTimes,
                                                                24,
                                                            )}
                                                            stroke="#ef4444"
                                                            stroke-width="0.5"
                                                            stroke-dasharray="2 2"
                                                            opacity="0.3"
                                                        />
                                                    </svg>
                                                </div>
                                            {/if}
                                        </div>
                                    {/each}
                                </div>
                            </div>
                        {/each}
                    </div>
                {/if}
            </Tabs.Content>
        </Tabs.Root>
    </Popover.Content>
</Popover.Root>
