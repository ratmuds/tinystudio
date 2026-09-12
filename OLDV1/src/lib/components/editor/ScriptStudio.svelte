<script lang="ts">
	import { onMount } from 'svelte';

	import { StreamLanguage } from '@codemirror/language';
	import { lua } from '@codemirror/legacy-modes/mode/lua';
	import { EditorView, basicSetup } from 'codemirror';

	import { editor, type ScriptNode } from '$lib/stores/editor.svelte';

	let codeEditorParent: HTMLDivElement;

	onMount(() => {
		let scriptNode: ScriptNode = {
			id: crypto.randomUUID(),
			type: 'script',
			name: 'Script',
			code: ''
		};

		editor.tabs[0].addScript(scriptNode);

		let view = new EditorView({
			parent: codeEditorParent,
			doc: `function wait(seconds)
    coroutine.yield(seconds or 0)
end

function gameLoop()
    local frameCount = 0

    while true do
        frameCount = frameCount + 1

        printLog("Frame:", frameCount)

        wait(1)
    end
end

mainThread = coroutine.create(gameLoop)
`,
			extensions: [
				basicSetup,
				StreamLanguage.define(lua),
				EditorView.updateListener.of((update) => {
					if (update.docChanged) {
						// Get the entire document content as a string
						const newValue = update.state.doc.toString();
						console.log('Value changed to:', newValue);

						scriptNode.code = newValue;
						editor.tabs[0].updateNode(scriptNode);
					}
				})
			]
		});

		//view.
	});
</script>

<div class="h-full w-full rounded-md border">
	<div bind:this={codeEditorParent} class="h-full w-full" />
</div>
