<script lang="ts">
	import { onMount } from 'svelte';
	import { gameAssets, Texture } from '$lib/stores/editor.svelte';

	let canvas: HTMLCanvasElement;

	let gridX = 16;
	let gridY = 16;
	let gridSize = 16;
	let gridData = Array.from({ length: gridY }, () => Array(gridX).fill(0));

	let assetName = $state('New Texture');
	let textureAsset: Texture | undefined = $state(undefined);

	onMount(() => {
		canvas.width = gridX * gridSize;
		canvas.height = gridY * gridSize;

		canvas.style.width = `${canvas.width}px`;
		canvas.style.height = `${canvas.height}px`;

		const ctx = canvas.getContext('2d');

		canvas.onclick = (e) => {
			if (!ctx) {
				console.error('Could not get canvas context!!!!!!!!!!!!!!!!!!!');
				return;
			}

			const rect = canvas.getBoundingClientRect();
			const x = e.clientX - rect.left;
			const y = e.clientY - rect.top;
			console.log(`Clicked at: ${x}, ${y}`);

			let snappedX = Math.floor(x / gridSize) * gridSize;
			let snappedY = Math.floor(y / gridSize) * gridSize;

			let color = '#ffffff';

			ctx.fillStyle = color;
			ctx.fillRect(snappedX, snappedY, gridSize, gridSize);

			gridData[Math.floor(snappedY / gridSize)][Math.floor(snappedX / gridSize)] = color;
		};
	});

	function saveTexture() {
		if (!canvas) {
			console.error('Canvas not initialized');
			return;
		}

		if (!assetName) {
			alert('Please enter a name for the texture');
			return;
		}

		if (!textureAsset) {
			textureAsset = {
				id: crypto.randomUUID(),
				name: assetName,
				imageData: '',
				pixels: []
			};

			gameAssets.addTexture(textureAsset);
		}

		const dataURL = canvas.toDataURL();

		textureAsset.imageData = dataURL;
		textureAsset.pixels = gridData;
		gameAssets.updateTexture(textureAsset);
	}
</script>

<canvas class="h-full w-full rounded border bg-black" bind:this={canvas}></canvas>

<input bind:value={assetName} type="text" placeholder="Texture Name" class="border p-2" />
<button onclick={saveTexture} class="border p-2">Save</button>
