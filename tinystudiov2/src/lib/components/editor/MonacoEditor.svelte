<script lang="ts">
    import { onMount } from "svelte";
    import type { editor } from "monaco-editor";
    import ProgressBar from "$lib/components/editor/ProgressBar.svelte";

    let {
        language = "lua",
        value = $bindable(""),
        theme = "dark",
        options = {},
    }: {
        language?: string;
        value?: string;
        theme?: "dark" | "light";
        options?: editor.IStandaloneEditorConstructionOptions;
    } = $props();

    let container: HTMLDivElement;
    let editorInstance: editor.IStandaloneCodeEditor | undefined;
    let isUpdatingFromEditor = false;
    let loaded = $state(false);

    // @ts-ignore
    self.MonacoEnvironment = {
        getWorker(_workerId: string, _label: string) {
            return new EditorWorker();
        },
    };

    function registerLuau(monaco: typeof import("monaco-editor")) {
        monaco.languages.register({ id: "luau" });
        monaco.languages.setMonarchTokensProvider("luau", {
            defaultToken: "",
            tokenPostfix: ".lua",
            keywords: [
                "and",
                "break",
                "do",
                "else",
                "elseif",
                "end",
                "false",
                "for",
                "function",
                "goto",
                "if",
                "in",
                "local",
                "nil",
                "not",
                "or",
                "repeat",
                "return",
                "then",
                "true",
                "until",
                "while",
                "continue",
            ],
            typeKeywords: [
                "string",
                "number",
                "boolean",
                "nil",
                "any",
                "thread",
                "buffer",
                "unknown",
            ],
            builtinFunctions: [
                "assert",
                "collectgarbage",
                "error",
                "getfenv",
                "getmetatable",
                "ipairs",
                "loadstring",
                "newproxy",
                "next",
                "pairs",
                "pcall",
                "print",
                "rawequal",
                "rawget",
                "rawlen",
                "rawset",
                "require",
                "select",
                "setfenv",
                "setmetatable",
                "tonumber",
                "tostring",
                "type",
                "typeof",
                "unpack",
                "xpcall",
                "warn",
            ],
            stringEscapes: [
                "\\a",
                "\\b",
                "\\f",
                "\\n",
                "\\r",
                "\\t",
                "\\v",
                "\\\\",
                '\\"',
                "\\'",
                "\\0",
                "\\z",
            ],
            symbols: /[=><!~?:&|+\-*/^%]+/,
            escapes:
                /\\(?:[abfnrtv\\"']|x[0-9A-Fa-f]{2}|[0-9]{1,3}|z[ \t\n\r]*|u\{[0-9A-Fa-f]+\})/,
            tokenizer: {
                root: [
                    [
                        /[a-zA-Z_]\w*/,
                        {
                            cases: {
                                "@keywords": { token: "keyword" },
                                "@typeKeywords": { token: "type" },
                                "@builtinFunctions": { token: "predefined" },
                                "@default": "identifier",
                            },
                        },
                    ],
                    { include: "@whitespace" },
                    [/[{}()[\]]/, "@brackets"],
                    [
                        /@symbols/,
                        {
                            cases: {
                                "@default": "operator",
                            },
                        },
                    ],
                    [/\d*\.\d+([eE][-+]?\d+)?/, "number.float"],
                    [/0[xX][0-9a-fA-F_]*[0-9a-fA-F]/, "number.hex"],
                    [/\d+/, "number"],
                    [/[;,.]/, "delimiter"],
                    [/"([^"\\]|\\.)*$/, "string.invalid"],
                    [/'([^'\\]|\\.)*$/, "string.invalid"],
                    [/"/, "string", "@doubleString"],
                    [/'/, "string", "@singleString"],
                    [/\[=*\[/, "string", "@multiString"],
                ],
                whitespace: [
                    [/[ \t\r\n]+/, ""],
                    [/--\[=*\[/, "comment", "@multiComment"],
                    [/--.*$/, "comment"],
                ],
                doubleString: [
                    [/[^\\"]+/, "string"],
                    [/@escapes/, "string.escape"],
                    [/\\./, "string.escape.invalid"],
                    [/"/, "string", "@pop"],
                ],
                singleString: [
                    [/[^\\']+/, "string"],
                    [/@escapes/, "string.escape"],
                    [/\\./, "string.escape.invalid"],
                    [/'/, "string", "@pop"],
                ],
                multiString: [
                    [/[^\]]+/, "string"],
                    [/\]=*\]/, "string", "@pop"],
                    [/./, "string"],
                ],
                multiComment: [
                    [/[^\]]+/, "comment"],
                    [/\]=*\]/, "comment", "@pop"],
                    [/./, "comment"],
                ],
            },
        });
    }

    onMount(async () => {
        const monaco = await import("monaco-editor");

        registerLuau(monaco);

        monaco.editor.defineTheme("tinystudio-dark", {
            base: "vs-dark",
            inherit: true,
            rules: [
                { token: "keyword", foreground: "22c55e", fontStyle: "bold" },
                { token: "type", foreground: "4ade80", fontStyle: "italic" },
                { token: "predefined", foreground: "86efac" },
                { token: "string", foreground: "fcd34d" },
                { token: "string.escape", foreground: "fbbf24" },
                { token: "number", foreground: "c084fc" },
                { token: "number.float", foreground: "c084fc" },
                { token: "number.hex", foreground: "c084fc" },
                { token: "comment", foreground: "6b7280", fontStyle: "italic" },
                { token: "operator", foreground: "94a3b8" },
                { token: "delimiter", foreground: "6b7280" },
                { token: "identifier", foreground: "e5e5e5" },
            ],
            colors: {
                "editor.background": "#1c1c1c",
                "editor.foreground": "#e5e5e5",
                "editor.lineHighlightBackground": "#22c55e0d",
                "editor.selectionBackground": "#22c55e40",
                "editor.inactiveSelectionBackground": "#22c55e25",
                "editorCursor.foreground": "#4ade80",
                "editorWhitespace.foreground": "#2a2a2a",
                "editorIndentGuide.background1": "#2a2a2a",
                "editorIndentGuide.activeBackground1": "#22c55e30",
                "editorLineNumber.foreground": "#404040",
                "editorLineNumber.activeForeground": "#22c55e",
                "editorBracketMatch.background": "#22c55e20",
                "editorBracketMatch.border": "#22c55e80",
                "editorSuggestWidget.background": "#1c1c1c",
                "editorSuggestWidget.border": "#2a2a2a",
                "editorSuggestWidget.selectedBackground": "#22c55e20",
                "editorSuggestWidget.highlightForeground": "#22c55e",
                "editorHoverWidget.background": "#1c1c1c",
                "editorHoverWidget.border": "#2a2a2a",
                "input.background": "#1c1c1c",
                "input.border": "#2a2a2a",
                "input.foreground": "#e5e5e5",
                focusBorder: "#22c55e80",
                "list.activeSelectionBackground": "#22c55e25",
                "list.activeSelectionForeground": "#e5e5e5",
                "list.highlightForeground": "#22c55e",
                "scrollbar.shadow": "#00000000",
                "scrollbarSlider.background": "#22c55e20",
                "scrollbarSlider.hoverBackground": "#22c55e35",
                "scrollbarSlider.activeBackground": "#22c55e50",
                "minimap.background": "#1c1c1c",
                "widget.shadow": "#00000040",
            },
        });

        monaco.editor.defineTheme("tinystudio-light", {
            base: "vs",
            inherit: true,
            rules: [
                { token: "keyword", foreground: "16a34a", fontStyle: "bold" },
                { token: "type", foreground: "15803d", fontStyle: "italic" },
                { token: "predefined", foreground: "166534" },
                { token: "string", foreground: "a16207" },
                { token: "string.escape", foreground: "854d0e" },
                { token: "number", foreground: "7c3aed" },
                { token: "number.float", foreground: "7c3aed" },
                { token: "number.hex", foreground: "7c3aed" },
                { token: "comment", foreground: "9ca3af", fontStyle: "italic" },
                { token: "operator", foreground: "4b5563" },
                { token: "delimiter", foreground: "9ca3af" },
                { token: "identifier", foreground: "1c1c1c" },
            ],
            colors: {
                "editor.background": "#ffffff",
                "editor.foreground": "#1c1c1c",
                "editor.lineHighlightBackground": "#22c55e0a",
                "editor.selectionBackground": "#22c55e25",
                "editor.inactiveSelectionBackground": "#22c55e15",
                "editorCursor.foreground": "#16a34a",
                "editorWhitespace.foreground": "#e5e7eb",
                "editorIndentGuide.background1": "#e5e7eb",
                "editorIndentGuide.activeBackground1": "#22c55e25",
                "editorLineNumber.foreground": "#c4c4c4",
                "editorLineNumber.activeForeground": "#16a34a",
                "editorBracketMatch.background": "#22c55e15",
                "editorBracketMatch.border": "#22c55e60",
                "editorSuggestWidget.background": "#ffffff",
                "editorSuggestWidget.border": "#e5e7eb",
                "editorSuggestWidget.selectedBackground": "#22c55e15",
                "editorSuggestWidget.highlightForeground": "#16a34a",
                "editorHoverWidget.background": "#ffffff",
                "editorHoverWidget.border": "#e5e7eb",
                "input.background": "#ffffff",
                "input.border": "#e5e7eb",
                "input.foreground": "#1c1c1c",
                focusBorder: "#22c55e60",
                "list.activeSelectionBackground": "#22c55e15",
                "list.activeSelectionForeground": "#1c1c1c",
                "list.highlightForeground": "#16a34a",
                "scrollbar.shadow": "#00000000",
                "scrollbarSlider.background": "#22c55e15",
                "scrollbarSlider.hoverBackground": "#22c55e25",
                "scrollbarSlider.activeBackground": "#22c55e40",
                "minimap.background": "#ffffff",
                "widget.shadow": "#00000015",
            },
        });

        const resolvedTheme =
            theme === "dark" ? "tinystudio-dark" : "tinystudio-light";

        editorInstance = monaco.editor.create(container, {
            value,
            language,
            theme: resolvedTheme,
            fontSize: 14,
            lineHeight: 22,
            letterSpacing: 0.3,
            fontLigatures: true,
            padding: { top: 16, bottom: 16 },
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            wordWrap: "off",
            automaticLayout: false,
            tabSize: 4,
            renderLineHighlight: "all",
            renderLineHighlightOnlyWhenFocus: false,
            smoothScrolling: true,
            cursorSmoothCaretAnimation: "on",
            cursorBlinking: "smooth",
            cursorWidth: 2,
            bracketPairColorization: { enabled: true },
            guides: {
                bracketPairs: true,
                indentation: true,
                highlightActiveIndentation: true,
            },
            overviewRulerLanes: 0,
            hideCursorInOverviewRuler: true,
            overviewRulerBorder: false,
            lineNumbersMinChars: 3,
            glyphMargin: false,
            folding: true,
            foldingHighlight: true,
            showFoldingControls: "mouseover",
            linkedEditing: true,
            suggest: {
                showMethods: true,
                showFunctions: true,
                showConstructors: true,
                showFields: true,
                showVariables: true,
                showClasses: true,
                showStructs: true,
                showInterfaces: true,
                showModules: true,
                showProperties: true,
                preview: true,
                shareSuggestSelections: true,
            },
            quickSuggestions: true,
            parameterHints: { enabled: true },
            autoClosingBrackets: "always",
            autoClosingQuotes: "always",
            autoSurround: "languageDefined",
            formatOnPaste: true,
            scrollbar: {
                verticalScrollbarSize: 8,
                horizontalScrollbarSize: 8,
                useShadows: false,
                verticalHasArrows: false,
                horizontalHasArrows: false,
                alwaysConsumeMouseWheel: false,
            },
            stickyScroll: { enabled: true },
            ...options,
        });

        editorInstance.onDidChangeModelContent(() => {
            isUpdatingFromEditor = true;
            value = editorInstance!.getValue();
            isUpdatingFromEditor = false;
        });

        loaded = true;

        const resizeObserver = new ResizeObserver(() => {
            editorInstance?.layout();
        });
        resizeObserver.observe(container);

        return () => {
            resizeObserver.disconnect();
            editorInstance?.dispose();
        };
    });

    $effect(() => {
        if (!editorInstance) return;
        const resolvedTheme =
            theme === "dark" ? "tinystudio-dark" : "tinystudio-light";
        editorInstance.updateOptions({ theme: resolvedTheme });
    });

    $effect(() => {
        if (!editorInstance || isUpdatingFromEditor) return;
        const currentValue = editorInstance.getValue();
        if (currentValue !== value) {
            editorInstance.setValue(value);
        }
    });
</script>

<div class="relative h-full w-full">
    {#if !loaded}
        <ProgressBar />
    {/if}
    <div bind:this={container} class="h-full w-full"></div>
</div>
