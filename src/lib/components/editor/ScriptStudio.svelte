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
    local part = find("Stud")

local vX = 0
local vY = 0
  
  onKeydown(function (key) 
    print("pressed" .. key)
      if (key == "w") then
        vY = vY + 1
      end

      if (key == "s") then
		vY = vY - 1
	  end

	  if (key == "a") then
		vX = vX - 1
	  end

	  if (key == "d") then
		vX = vX + 1
	  end
    end)

	onKeyup(function (key)
	print("released" .. key)

 	  if (key == "w") then
		vY = vY - 1
	  end

	  if (key == "s") then
		vY = vY + 1
					end

if (key == "a") then
	vX = vX + 1
end

if (key == "d") then
	vX = vX - 1
end
end)


    while true do
        wait(0.1)

		part.velocity = {x = vX * 10, y = 0, z = vY * 10}
    end
end

mainThread = coroutine.create(gameLoop)`,
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
