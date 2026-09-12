<script lang="ts">
    import { onMount } from "svelte";
    import type { editor } from "monaco-editor";
    import EditorWorker from "monaco-editor/editor/editor.worker?worker";
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

    if (typeof window !== "undefined") {
        // @ts-ignore
        self.MonacoEnvironment = {
            getWorker() {
                return new EditorWorker();
            },
        };
    }

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

    let intelliSenseRegistered = false;

    function registerLuauIntelliSense(monaco: typeof import("monaco-editor")) {
        if (intelliSenseRegistered) return;
        intelliSenseRegistered = true;

        const languages = ["luau", "lua"];

        for (const lang of languages) {
            monaco.languages.registerCompletionItemProvider(lang, {
                triggerCharacters: [".", ":", '"', "'"],
                provideCompletionItems: (model, position) => {
                    const lineContent = model.getLineContent(position.lineNumber);
                    const lineUntilCursor = lineContent.slice(0, position.column - 1);
                    const word = model.getWordUntilPosition(position);
                    const range = {
                        startLineNumber: position.lineNumber,
                        endLineNumber: position.lineNumber,
                        startColumn: word.startColumn,
                        endColumn: word.endColumn,
                    };

                    // Check for event string completion inside :on("...")
                    const eventMatch = lineUntilCursor.match(
                        /(?:entity|this):on\(\s*["']([^"']*)$/,
                    );
                    if (eventMatch) {
                        return {
                            suggestions: [
                                {
                                    label: "Physics.touched",
                                    kind: monaco.languages.CompletionItemKind.Event,
                                    detail: "Fired when entity collides with another physics body",
                                    insertText: "Physics.touched",
                                    range,
                                },
                                {
                                    label: "click",
                                    kind: monaco.languages.CompletionItemKind.Event,
                                    detail: "Fired when entity or UI element is clicked",
                                    insertText: "click",
                                    range,
                                },
                                {
                                    label: "UI.click",
                                    kind: monaco.languages.CompletionItemKind.Event,
                                    detail: "Fired when a UI button is clicked",
                                    insertText: "UI.click",
                                    range,
                                },
                                {
                                    label: "update",
                                    kind: monaco.languages.CompletionItemKind.Event,
                                    detail: "Fired each frame with (dt)",
                                    insertText: "update",
                                    range,
                                },
                            ],
                        };
                    }

                    // Check for dot / colon member access
                    const memberMatch = lineUntilCursor.match(
                        /([a-zA-Z0-9_]+(?:\.[a-zA-Z0-9_]+)*)([\.:])([a-zA-Z0-9_]*)$/,
                    );

                    if (memberMatch) {
                        const targetExpr = memberMatch[1];
                        const separator = memberMatch[2];
                        const suggestions: any[] = [];

                        // Vector3 constants and methods
                        if (targetExpr === "Vector3") {
                            suggestions.push(
                                {
                                    label: "new",
                                    kind: monaco.languages.CompletionItemKind.Constructor,
                                    detail: "Vector3.new(x, y, z)",
                                    insertText: "new(${1:0}, ${2:0}, ${3:0})",
                                    insertTextRules:
                                        monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                                    documentation:
                                        "Constructs a new 3D vector with x, y, z components.",
                                    range,
                                },
                                {
                                    label: "zero",
                                    kind: monaco.languages.CompletionItemKind.Constant,
                                    detail: "Vector3(0, 0, 0)",
                                    insertText: "zero",
                                    documentation:
                                        "Shorthand for Vector3.new(0, 0, 0).",
                                    range,
                                },
                                {
                                    label: "one",
                                    kind: monaco.languages.CompletionItemKind.Constant,
                                    detail: "Vector3(1, 1, 1)",
                                    insertText: "one",
                                    range,
                                },
                                {
                                    label: "up",
                                    kind: monaco.languages.CompletionItemKind.Constant,
                                    detail: "Vector3(0, 1, 0)",
                                    insertText: "up",
                                    range,
                                },
                                {
                                    label: "down",
                                    kind: monaco.languages.CompletionItemKind.Constant,
                                    detail: "Vector3(0, -1, 0)",
                                    insertText: "down",
                                    range,
                                },
                                {
                                    label: "left",
                                    kind: monaco.languages.CompletionItemKind.Constant,
                                    detail: "Vector3(-1, 0, 0)",
                                    insertText: "left",
                                    range,
                                },
                                {
                                    label: "right",
                                    kind: monaco.languages.CompletionItemKind.Constant,
                                    detail: "Vector3(1, 0, 0)",
                                    insertText: "right",
                                    range,
                                },
                                {
                                    label: "forward",
                                    kind: monaco.languages.CompletionItemKind.Constant,
                                    detail: "Vector3(0, 0, -1)",
                                    insertText: "forward",
                                    range,
                                },
                                {
                                    label: "back",
                                    kind: monaco.languages.CompletionItemKind.Constant,
                                    detail: "Vector3(0, 0, 1)",
                                    insertText: "back",
                                    range,
                                },
                                {
                                    label: "distance",
                                    kind: monaco.languages.CompletionItemKind.Method,
                                    detail: "Vector3.distance(a, b)",
                                    insertText: "distance(${1:a}, ${2:b})",
                                    insertTextRules:
                                        monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                                    range,
                                },
                                {
                                    label: "lerp",
                                    kind: monaco.languages.CompletionItemKind.Method,
                                    detail: "Vector3.lerp(a, b, t)",
                                    insertText: "lerp(${1:a}, ${2:b}, ${3:0.5})",
                                    insertTextRules:
                                        monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                                    range,
                                },
                            );
                            return { suggestions };
                        }

                        // Vector2
                        if (targetExpr === "Vector2") {
                            suggestions.push(
                                {
                                    label: "new",
                                    kind: monaco.languages.CompletionItemKind.Constructor,
                                    detail: "Vector2.new(x, y)",
                                    insertText: "new(${1:0}, ${2:0})",
                                    insertTextRules:
                                        monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                                    range,
                                },
                                {
                                    label: "zero",
                                    kind: monaco.languages.CompletionItemKind.Constant,
                                    detail: "Vector2(0, 0)",
                                    insertText: "zero",
                                    range,
                                },
                                {
                                    label: "one",
                                    kind: monaco.languages.CompletionItemKind.Constant,
                                    detail: "Vector2(1, 1)",
                                    insertText: "one",
                                    range,
                                },
                            );
                            return { suggestions };
                        }

                        // Input service
                        if (targetExpr === "Input") {
                            suggestions.push(
                                {
                                    label: "isKeyDown",
                                    kind: monaco.languages.CompletionItemKind.Method,
                                    detail: "Input.isKeyDown(key: string): boolean",
                                    insertText: 'isKeyDown("${1:KeyW}")',
                                    insertTextRules:
                                        monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                                    documentation:
                                        "Returns true if the key is currently pressed down. Example keys: 'KeyW', 'KeyA', 'Space', 'ShiftLeft'.",
                                    range,
                                },
                                {
                                    label: "isKeyPressed",
                                    kind: monaco.languages.CompletionItemKind.Method,
                                    detail: "Input.isKeyPressed(key: string): boolean",
                                    insertText: 'isKeyPressed("${1:Space}")',
                                    insertTextRules:
                                        monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                                    documentation:
                                        "Returns true only on the frame the key was initially pressed.",
                                    range,
                                },
                                {
                                    label: "isMouseButtonDown",
                                    kind: monaco.languages.CompletionItemKind.Method,
                                    detail: "Input.isMouseButtonDown(button: number): boolean",
                                    insertText: "isMouseButtonDown(${1:0})",
                                    insertTextRules:
                                        monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                                    documentation:
                                        "Returns true if mouse button is held down. (0: Left, 1: Middle, 2: Right)",
                                    range,
                                },
                                {
                                    label: "getMousePosition",
                                    kind: monaco.languages.CompletionItemKind.Method,
                                    detail: "Input.getMousePosition(): Vector2",
                                    insertText: "getMousePosition()",
                                    documentation:
                                        "Returns current mouse coordinates in normalized viewport space (-1 to +1).",
                                    range,
                                },
                                {
                                    label: "getMouseDelta",
                                    kind: monaco.languages.CompletionItemKind.Method,
                                    detail: "Input.getMouseDelta(): Vector2",
                                    insertText: "getMouseDelta()",
                                    documentation:
                                        "Returns mouse movement delta since last frame.",
                                    range,
                                },
                                {
                                    label: "getScroll",
                                    kind: monaco.languages.CompletionItemKind.Method,
                                    detail: "Input.getScroll(): number",
                                    insertText: "getScroll()",
                                    documentation:
                                        "Returns vertical scroll wheel delta.",
                                    range,
                                },
                            );
                            return { suggestions };
                        }

                        // UI static manager
                        if (targetExpr === "UI") {
                            suggestions.push(
                                {
                                    label: "setText",
                                    kind: monaco.languages.CompletionItemKind.Method,
                                    detail: "UI.setText(target: string | Entity, text: string)",
                                    insertText:
                                        'setText("${1:UIButton 1}", "${2:Click Me!}")',
                                    insertTextRules:
                                        monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                                    documentation:
                                        "Sets the visible text of a UI Button or UI Text element.",
                                    range,
                                },
                                {
                                    label: "getText",
                                    kind: monaco.languages.CompletionItemKind.Method,
                                    detail: "UI.getText(target: string | Entity): string",
                                    insertText: 'getText("${1:UIButton 1}")',
                                    insertTextRules:
                                        monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                                    documentation:
                                        "Retrieves the current text of a UI element.",
                                    range,
                                },
                                {
                                    label: "onClick",
                                    kind: monaco.languages.CompletionItemKind.Method,
                                    detail: "UI.onClick(target: string | Entity, callback: function)",
                                    insertText:
                                        'onClick("${1:UIButton 1}", function()\n\t${2:print("Button clicked!")}\nend)',
                                    insertTextRules:
                                        monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                                    documentation:
                                        "Registers a click listener for a UI Button. Can target by entity name or entity object.",
                                    range,
                                },
                                {
                                    label: "setColor",
                                    kind: monaco.languages.CompletionItemKind.Method,
                                    detail: "UI.setColor(target: string | Entity, color: string)",
                                    insertText:
                                        'setColor("${1:UIButton 1}", "${2:#ffffff}")',
                                    insertTextRules:
                                        monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                                    documentation:
                                        "Sets the text color (hex string like '#ffffff').",
                                    range,
                                },
                                {
                                    label: "setBackgroundColor",
                                    kind: monaco.languages.CompletionItemKind.Method,
                                    detail: "UI.setBackgroundColor(target: string | Entity, color: string)",
                                    insertText:
                                        'setBackgroundColor("${1:UIButton 1}", "${2:#22c55e}")',
                                    insertTextRules:
                                        monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                                    documentation:
                                        "Sets background color of the UI button or text container.",
                                    range,
                                },
                                {
                                    label: "setVisible",
                                    kind: monaco.languages.CompletionItemKind.Method,
                                    detail: "UI.setVisible(target: string | Entity, visible: boolean)",
                                    insertText:
                                        'setVisible("${1:UIButton 1}", ${2:true})',
                                    insertTextRules:
                                        monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                                    documentation:
                                        "Toggles whether the UI element is displayed on the screen.",
                                    range,
                                },
                            );
                            return { suggestions };
                        }

                        // Transform
                        if (targetExpr === "Transform") {
                            suggestions.push(
                                {
                                    label: "position",
                                    kind: monaco.languages.CompletionItemKind.Property,
                                    detail: "position: Vector3",
                                    insertText: "position",
                                    documentation:
                                        "World position of the entity. Can set components directly: Transform.position.x = 5.",
                                    range,
                                },
                                {
                                    label: "rotation",
                                    kind: monaco.languages.CompletionItemKind.Property,
                                    detail: "rotation: Vector3",
                                    insertText: "rotation",
                                    documentation:
                                        "Euler rotation in radians: { x, y, z }.",
                                    range,
                                },
                                {
                                    label: "scale",
                                    kind: monaco.languages.CompletionItemKind.Property,
                                    detail: "scale: Vector3",
                                    insertText: "scale",
                                    documentation:
                                        "Scale multiplier: { x, y, z }.",
                                    range,
                                },
                            );
                            return { suggestions };
                        }

                        // Vector subfields
                        if (
                            targetExpr.endsWith("position") ||
                            targetExpr.endsWith("rotation") ||
                            targetExpr.endsWith("scale") ||
                            targetExpr.endsWith("velocity") ||
                            targetExpr === "pos" ||
                            targetExpr === "move"
                        ) {
                            suggestions.push(
                                {
                                    label: "x",
                                    kind: monaco.languages.CompletionItemKind.Field,
                                    detail: "number",
                                    insertText: "x",
                                    range,
                                },
                                {
                                    label: "y",
                                    kind: monaco.languages.CompletionItemKind.Field,
                                    detail: "number",
                                    insertText: "y",
                                    range,
                                },
                                {
                                    label: "z",
                                    kind: monaco.languages.CompletionItemKind.Field,
                                    detail: "number",
                                    insertText: "z",
                                    range,
                                },
                            );
                            return { suggestions };
                        }

                        // Physics component
                        if (targetExpr === "Physics") {
                            suggestions.push(
                                {
                                    label: "applyImpulse",
                                    kind: monaco.languages.CompletionItemKind.Method,
                                    detail: "Physics:applyImpulse(vector: Vector3)",
                                    insertText:
                                        'applyImpulse(${1:Vector3.new(0, 10, 0)})',
                                    insertTextRules:
                                        monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                                    documentation:
                                        "Applies an instantaneous impulse force to the rigid body.",
                                    range,
                                },
                                {
                                    label: "setVelocity",
                                    kind: monaco.languages.CompletionItemKind.Method,
                                    detail: "Physics:setVelocity(vector: Vector3)",
                                    insertText:
                                        'setVelocity(${1:Vector3.new(0, 5, 0)})',
                                    insertTextRules:
                                        monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                                    documentation:
                                        "Directly sets the linear velocity of the rigid body.",
                                    range,
                                },
                                {
                                    label: "anchored",
                                    kind: monaco.languages.CompletionItemKind.Property,
                                    detail: "anchored: boolean",
                                    insertText: "anchored",
                                    documentation:
                                        "If true, physics will not move the entity under gravity or collisions.",
                                    range,
                                },
                                {
                                    label: "mass",
                                    kind: monaco.languages.CompletionItemKind.Property,
                                    detail: "mass: number",
                                    insertText: "mass",
                                    range,
                                },
                            );
                            return { suggestions };
                        }

                        // UIComp (entity UI component)
                        if (targetExpr === "UIComp") {
                            suggestions.push(
                                {
                                    label: "text",
                                    kind: monaco.languages.CompletionItemKind.Property,
                                    detail: "text: string",
                                    insertText: "text",
                                    range,
                                },
                                {
                                    label: "x",
                                    kind: monaco.languages.CompletionItemKind.Property,
                                    detail: "x: number (pixels)",
                                    insertText: "x",
                                    range,
                                },
                                {
                                    label: "y",
                                    kind: monaco.languages.CompletionItemKind.Property,
                                    detail: "y: number (pixels)",
                                    insertText: "y",
                                    range,
                                },
                                {
                                    label: "width",
                                    kind: monaco.languages.CompletionItemKind.Property,
                                    detail: "width: number",
                                    insertText: "width",
                                    range,
                                },
                                {
                                    label: "height",
                                    kind: monaco.languages.CompletionItemKind.Property,
                                    detail: "height: number",
                                    insertText: "height",
                                    range,
                                },
                                {
                                    label: "color",
                                    kind: monaco.languages.CompletionItemKind.Property,
                                    detail: "color: string (hex)",
                                    insertText: "color",
                                    range,
                                },
                                {
                                    label: "backgroundColor",
                                    kind: monaco.languages.CompletionItemKind.Property,
                                    detail: "backgroundColor: string (hex)",
                                    insertText: "backgroundColor",
                                    range,
                                },
                                {
                                    label: "fontSize",
                                    kind: monaco.languages.CompletionItemKind.Property,
                                    detail: "fontSize: number",
                                    insertText: "fontSize",
                                    range,
                                },
                                {
                                    label: "visible",
                                    kind: monaco.languages.CompletionItemKind.Property,
                                    detail: "visible: boolean",
                                    insertText: "visible",
                                    range,
                                },
                            );
                            return { suggestions };
                        }

                        // entity / this
                        if (
                            targetExpr === "entity" ||
                            targetExpr === "this" ||
                            targetExpr.endsWith("Entity")
                        ) {
                            suggestions.push(
                                {
                                    label: "Transform",
                                    kind: monaco.languages.CompletionItemKind.Property,
                                    detail: "Transform component",
                                    insertText: "Transform",
                                    range,
                                },
                                {
                                    label: "Physics",
                                    kind: monaco.languages.CompletionItemKind.Property,
                                    detail: "Physics component",
                                    insertText: "Physics",
                                    range,
                                },
                                {
                                    label: "Mesh",
                                    kind: monaco.languages.CompletionItemKind.Property,
                                    detail: "Mesh component",
                                    insertText: "Mesh",
                                    range,
                                },
                                {
                                    label: "UI",
                                    kind: monaco.languages.CompletionItemKind.Property,
                                    detail: "UI component",
                                    insertText: "UI",
                                    range,
                                },
                                {
                                    label: "Camera",
                                    kind: monaco.languages.CompletionItemKind.Property,
                                    detail: "Camera component",
                                    insertText: "Camera",
                                    range,
                                },
                                {
                                    label: "PlayerController",
                                    kind: monaco.languages.CompletionItemKind.Property,
                                    detail: "PlayerController component",
                                    insertText: "PlayerController",
                                    range,
                                },
                                {
                                    label: "id",
                                    kind: monaco.languages.CompletionItemKind.Field,
                                    detail: "UUID string",
                                    insertText: "id",
                                    range,
                                },
                                {
                                    label: "name",
                                    kind: monaco.languages.CompletionItemKind.Field,
                                    detail: "Entity name string",
                                    insertText: "name",
                                    range,
                                },
                                {
                                    label: "on",
                                    kind: monaco.languages.CompletionItemKind.Method,
                                    detail: "entity:on(event: string, handler: function)",
                                    insertText:
                                        'on("${1:Physics.touched}", function(${2:other})\n\t${3}\nend)',
                                    insertTextRules:
                                        monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                                    range,
                                },
                                {
                                    label: "emit",
                                    kind: monaco.languages.CompletionItemKind.Method,
                                    detail: "entity:emit(event: string, data: any)",
                                    insertText: 'emit("${1:eventName}", ${2:{}})',
                                    insertTextRules:
                                        monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                                    range,
                                },
                                {
                                    label: "destroy",
                                    kind: monaco.languages.CompletionItemKind.Method,
                                    detail: "entity:destroy()",
                                    insertText: "destroy()",
                                    documentation:
                                        "Destroys this entity, removing its physics body, mesh from scene, and ECS data.",
                                    range,
                                },
                            );
                            return { suggestions };
                        }

                        // PlayerController component
                        if (targetExpr === "PlayerController") {
                            suggestions.push(
                                {
                                    label: "speed",
                                    kind: monaco.languages.CompletionItemKind.Property,
                                    detail: "speed: number",
                                    insertText: "speed",
                                    documentation: "Player walk/run speed in m/s.",
                                    range,
                                },
                                {
                                    label: "jumpForce",
                                    kind: monaco.languages.CompletionItemKind.Property,
                                    detail: "jumpForce: number",
                                    insertText: "jumpForce",
                                    documentation: "Upward jump force / velocity.",
                                    range,
                                },
                                {
                                    label: "airControl",
                                    kind: monaco.languages.CompletionItemKind.Property,
                                    detail: "airControl: number",
                                    insertText: "airControl",
                                    documentation: "Multiplier for directional control while in the air (0.0 to 1.0).",
                                    range,
                                },
                                {
                                    label: "enabled",
                                    kind: monaco.languages.CompletionItemKind.Property,
                                    detail: "enabled: boolean",
                                    insertText: "enabled",
                                    documentation: "Whether keyboard input controls this entity.",
                                    range,
                                },
                            );
                            return { suggestions };
                        }

                        // math library
                        if (targetExpr === "math") {
                            const mathMethods = [
                                "abs",
                                "sin",
                                "cos",
                                "tan",
                                "rad",
                                "deg",
                                "floor",
                                "ceil",
                                "min",
                                "max",
                                "sqrt",
                                "random",
                                "pi",
                            ];
                            for (const m of mathMethods) {
                                suggestions.push({
                                    label: m,
                                    kind:
                                        m === "pi"
                                            ? monaco.languages.CompletionItemKind.Constant
                                            : monaco.languages.CompletionItemKind.Function,
                                    detail: `math.${m}`,
                                    insertText:
                                        m === "pi" ? "pi" : `${m}(\${1})`,
                                    insertTextRules:
                                        monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                                    range,
                                });
                            }
                            return { suggestions };
                        }
                    }

                    // Default root / global completions & snippets
                    return {
                        suggestions: [
                            // Core injected globals
                            {
                                label: "this",
                                kind: monaco.languages.CompletionItemKind.Variable,
                                detail: "Entity: The current entity running this script",
                                insertText: "this",
                                range,
                            },
                            {
                                label: "entity",
                                kind: monaco.languages.CompletionItemKind.Variable,
                                detail: "Entity: Alias to this",
                                insertText: "entity",
                                range,
                            },
                            {
                                label: "Transform",
                                kind: monaco.languages.CompletionItemKind.Variable,
                                detail: "Transform component: .position, .rotation, .scale",
                                insertText: "Transform",
                                range,
                            },
                            {
                                label: "Physics",
                                kind: monaco.languages.CompletionItemKind.Variable,
                                detail: "Physics component: :applyImpulse(), :setVelocity()",
                                insertText: "Physics",
                                range,
                            },
                            {
                                label: "UI",
                                kind: monaco.languages.CompletionItemKind.Module,
                                detail: "UI system: .setText, .getText, .onClick, .setColor, .setVisible",
                                insertText: "UI",
                                range,
                            },
                            {
                                label: "Input",
                                kind: monaco.languages.CompletionItemKind.Module,
                                detail: "Input query: .isKeyDown, .isKeyPressed, .getMousePosition",
                                insertText: "Input",
                                range,
                            },
                            {
                                label: "Vector3",
                                kind: monaco.languages.CompletionItemKind.Class,
                                detail: "Vector3 math & constructor: .new(x, y, z), .zero, .up, etc.",
                                insertText: "Vector3",
                                range,
                            },
                            {
                                label: "Vector2",
                                kind: monaco.languages.CompletionItemKind.Class,
                                detail: "Vector2 math & constructor: .new(x, y), .zero",
                                insertText: "Vector2",
                                range,
                            },
                            {
                                label: "wait",
                                kind: monaco.languages.CompletionItemKind.Function,
                                detail: "wait(seconds: number): Yields coroutine without blocking",
                                insertText: "wait(${1:0.016})",
                                insertTextRules:
                                    monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                                range,
                            },
                            {
                                label: "print",
                                kind: monaco.languages.CompletionItemKind.Function,
                                detail: "print(...args): Print message to console",
                                insertText: "print(${1:message})",
                                insertTextRules:
                                    monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                                range,
                            },
                            {
                                label: "warn",
                                kind: monaco.languages.CompletionItemKind.Function,
                                detail: "warn(...args): Print warning to console",
                                insertText: "warn(${1:message})",
                                insertTextRules:
                                    monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                                range,
                            },
                            {
                                label: "getEntityByName",
                                kind: monaco.languages.CompletionItemKind.Function,
                                detail: "getEntityByName(name: string): Entity | nil",
                                insertText: 'getEntityByName("${1:Name}")',
                                insertTextRules:
                                    monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                                range,
                            },
                            {
                                label: "getEntityById",
                                kind: monaco.languages.CompletionItemKind.Function,
                                detail: "getEntityById(id: string): Entity | nil",
                                insertText: 'getEntityById("${1:id}")',
                                insertTextRules:
                                    monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                                range,
                            },
                            // Snippets
                            {
                                label: "gameLoop",
                                kind: monaco.languages.CompletionItemKind.Snippet,
                                detail: "while true loop with wait()",
                                insertText:
                                    "while true do\n\twait(${1:0.016})\n\t${0}\nend",
                                insertTextRules:
                                    monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                                range,
                            },
                            {
                                label: "onTouched",
                                kind: monaco.languages.CompletionItemKind.Snippet,
                                detail: "Physics collision event listener",
                                insertText:
                                    'entity:on("Physics.touched", function(${1:other})\n\tprint("Touched by: " .. (other and other.name or "unknown"))\n\t${0}\nend)',
                                insertTextRules:
                                    monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                                range,
                            },
                            {
                                label: "onUIClick",
                                kind: monaco.languages.CompletionItemKind.Snippet,
                                detail: "UI Button click listener snippet",
                                insertText:
                                    'UI.onClick("${1:UIButton 1}", function()\n\t${0:print("Button clicked!")}\nend)',
                                insertTextRules:
                                    monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                                range,
                            },
                            {
                                label: "playerMovement",
                                kind: monaco.languages.CompletionItemKind.Snippet,
                                detail: "WASD keyboard movement controller",
                                insertText:
                                    'local speed = ${1:5}\nwhile true do\n\twait(0.016)\n\tlocal move = Vector3.zero\n\tif Input.isKeyDown("KeyW") then move = move + Vector3.forward end\n\tif Input.isKeyDown("KeyS") then move = move + Vector3.back end\n\tif Input.isKeyDown("KeyA") then move = move + Vector3.left end\n\tif Input.isKeyDown("KeyD") then move = move + Vector3.right end\n\tTransform.position = Transform.position + move * speed * 0.016\nend',
                                insertTextRules:
                                    monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                                range,
                            },
                            {
                                label: "spinObject",
                                kind: monaco.languages.CompletionItemKind.Snippet,
                                detail: "Continuous Y rotation snippet",
                                insertText:
                                    "while true do\n\twait(0.016)\n\tTransform.rotation.y = Transform.rotation.y + ${1:0.05}\nend",
                                insertTextRules:
                                    monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                                range,
                            },
                            {
                                label: "jumpImpulse",
                                kind: monaco.languages.CompletionItemKind.Snippet,
                                detail: "Apply jump impulse on Space press",
                                insertText:
                                    'if Input.isKeyPressed("Space") then\n\tPhysics:applyImpulse(Vector3.new(0, ${1:10}, 0))\nend',
                                insertTextRules:
                                    monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                                range,
                            },
                        ],
                    };
                },
            });

            // Hover Provider for documentation
            monaco.languages.registerHoverProvider(lang, {
                provideHover: (model, position) => {
                    const word = model.getWordAtPosition(position);
                    if (!word) return null;

                    const hovers: Record<
                        string,
                        { title: string; desc: string }
                    > = {
                        this: {
                            title: "entity / this: Entity",
                            desc: "The current entity instance executing this script.\n\n- `Transform`: Transform component (`position`, `rotation`, `scale`)\n- `Physics`: Rigid body physics component (`:applyImpulse`, `:setVelocity`)\n- `entity:on(eventName, callback)`: Listen to events\n- `entity:emit(eventName, data)`: Emit an event",
                        },
                        entity: {
                            title: "entity: Entity",
                            desc: "Alias to `this`. Represents the entity running this script.",
                        },
                        Transform: {
                            title: "Transform: Component",
                            desc: "Controls the entity's position, rotation, and scale in 3D world space.\n\n- `Transform.position`: Vector3 { x, y, z }\n- `Transform.rotation`: Vector3 { x, y, z } (Euler in radians)\n- `Transform.scale`: Vector3 { x, y, z }\n\n*Tip*: Direct property assignment like `Transform.position.x = 5` updates immediately!",
                        },
                        Physics: {
                            title: "Physics: Component",
                            desc: "Controls Rapier 3D physics integration.\n\n- `Physics:applyImpulse(vector)`: Apply impulse force\n- `Physics:setVelocity(vector)`: Set linear velocity directly\n- `Physics.anchored`: Static / dynamic toggle\n- `Physics.mass`: Body mass in kg",
                        },
                        Vector3: {
                            title: "Vector3: Class",
                            desc: "3D Cartesian vector mathematics.\n\n- `Vector3.new(x, y, z)`: Constructor\n- `Vector3.zero`, `.one`, `.up`, `.down`, `.left`, `.right`, `.forward`, `.back`\n- Operators: `+`, `-`, `*`, `/`",
                        },
                        Vector2: {
                            title: "Vector2: Class",
                            desc: "2D Cartesian vector mathematics.\n\n- `Vector2.new(x, y)`: Constructor\n- `Vector2.zero`, `.one`",
                        },
                        Input: {
                            title: "Input: Library",
                            desc: "Query keyboard and mouse input states.\n\n- `Input.isKeyDown(key: string)`: Held state (e.g. 'KeyW', 'Space')\n- `Input.isKeyPressed(key: string)`: Just pressed this frame\n- `Input.isMouseButtonDown(button: number)`: Mouse button state\n- `Input.getMousePosition()`: Screen normalized mouse position\n- `Input.getMouseDelta()`: Mouse frame delta\n- `Input.getScroll()`: Wheel delta",
                        },
                        UI: {
                            title: "UI: Library",
                            desc: "Screen HTML UI manager.\n\n- `UI.setText(target, text)`: Update button/label text\n- `UI.getText(target)`: Read button/label text\n- `UI.onClick(target, fn)`: Listen to UI button click\n- `UI.setColor(target, hex)`: Change text color\n- `UI.setBackgroundColor(target, hex)`: Change background color\n- `UI.setVisible(target, bool)`: Show/hide UI element",
                        },
                        wait: {
                            title: "wait(seconds: number): number",
                            desc: "Yields the coroutine for the specified duration in seconds without blocking the engine frame loop.\n\nExample:\n```lua\nwhile true do\n    wait(0.016)\n    Transform.rotation.y = Transform.rotation.y + 0.05\nend\n```",
                        },
                    };

                    const info = hovers[word.word];
                    if (!info) return null;

                    return {
                        range: new monaco.Range(
                            position.lineNumber,
                            word.startColumn,
                            position.lineNumber,
                            word.endColumn,
                        ),
                        contents: [
                            { value: `**${info.title}**` },
                            { value: info.desc },
                        ],
                    };
                },
            });
        }
    }

    onMount(() => {
        let resizeObserver: ResizeObserver | undefined;

        (async () => {
            const monaco = await import("monaco-editor");

            registerLuau(monaco);
            registerLuauIntelliSense(monaco);

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

            resizeObserver = new ResizeObserver(() => {
                editorInstance?.layout();
            });
            if (container) resizeObserver.observe(container);
        })();

        return () => {
            resizeObserver?.disconnect();
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
