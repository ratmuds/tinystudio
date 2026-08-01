<script lang="ts">
    /**
     * A small textarea-based JSON editor. Keeps a local text buffer so partial
     * edits (invalid JSON) don't clobber the bound value; commits a parse back
     * to the parent whenever the text is valid JSON.
     */
    let {
        value = $bindable(),
        label = "",
        rows = 8,
    }: {
        value: any;
        label?: string;
        rows?: number;
    } = $props();

    let text = $state("");
    let error = $state(false);

    // Seed the local buffer from the bound value, and re-sync when the bound
    // value changes externally (e.g. switching to a different script).
    $effect(() => {
        text = JSON.stringify(value, null, 2);
        error = false;
    });

    function oninput(e: Event) {
        text = (e.currentTarget as HTMLTextAreaElement).value;
        try {
            value = JSON.parse(text);
            error = false;
        } catch {
            error = true;
        }
    }
</script>

<div>
    {#if label}
        <p class="mb-1 text-sm">{label}</p>
    {/if}
    <textarea
        {rows}
        value={text}
        oninput={oninput}
        class="my-2 w-full rounded-md border-2 border-border/60 bg-background px-3 py-2 font-mono text-xs duration-150 outline-none focus:border-green-700 {error
            ? 'border-destructive/60'
            : ''}"
    ></textarea>
    {#if error}
        <p class="mb-1 text-xs text-destructive">Invalid JSON</p>
    {/if}
</div>