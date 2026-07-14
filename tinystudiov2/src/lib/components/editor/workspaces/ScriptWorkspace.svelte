<script lang="ts">
    import * as Resizable from "$lib/components/ui/resizable/index.js";
</script>

<Resizable.PaneGroup direction="horizontal" class="min-h-0 flex-1">
    <Resizable.Pane defaultSize={20} class="overflow-hidden border-r">
        <div class="flex h-full flex-col items-center justify-center p-8">
            <p class="text-sm text-muted-foreground">Script explorer</p>
            <p class="mt-1 text-xs text-muted-foreground/60">Coming soon</p>
        </div>
    </Resizable.Pane>

    <Resizable.Handle />

    <Resizable.Pane>
        <div
            class="flex h-full w-full flex-col items-center justify-center bg-background"
        >
            <p class="text-sm text-muted-foreground">Script editor</p>
            <p class="mt-1 text-xs text-muted-foreground/60">Coming soon</p>
        </div>
    </Resizable.Pane>

    <Resizable.Handle />

    <Resizable.Pane defaultSize={22} class="overflow-hidden border-l">
        <div class="flex h-full flex-col items-center justify-center p-8">
            <p class="text-sm text-muted-foreground">Script properties</p>
            <p class="mt-1 text-xs text-muted-foreground/60">Coming soon</p>
        </div>
    </Resizable.Pane>
</Resizable.PaneGroup>
