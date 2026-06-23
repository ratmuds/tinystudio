<script lang="ts">
  // Bind to an object for easy parent-component use, but manage as a string internally
  let { value = $bindable({ x: 0, y: 0, z: 0 }), step = 0.1 } = $props();

  // Derive a space-separated string representation for rendering/editing
  let textValue = $state(`${value.x} ${value.y} ${value.z}`);

  // Keep the parent binding updated when the internal text changes
  $effect(() => {
    const parts = textValue.trim().split(/\s+/);
    if (parts.length >= 3) {
      value.x = Number(parts[0]) || 0;
      value.y = Number(parts[1]) || 0;
      value.z = Number(parts[2]) || 0;
    }
  });

  // Synchronize external changes back to the text field if necessary
  $effect(() => {
    const currentText = `${value.x} ${value.y} ${value.z}`;
    if (
      textValue !== currentText &&
      !document.activeElement?.classList.contains("vector-editor")
    ) {
      textValue = currentText;
    }
  });

  // Handle Up/Down arrow keys to increment the specific number the cursor is on
  function handleKeyDown(e: KeyboardEvent) {
    const input = e.currentTarget as HTMLInputElement;

    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      const cursorIdx = input.selectionStart || 0;
      const parts = textValue.split(" ");

      // Figure out which segment (X, Y, or Z) the cursor is currently inside
      let currentLength = 0;
      let activeSegmentIndex = 0;

      for (let i = 0; i < parts.length; i++) {
        currentLength += parts[i].length + 1; // +1 for the space
        if (cursorIdx <= currentLength) {
          activeSegmentIndex = i;
          break;
        }
      }

      // Modify only that specific segment
      let num = Number(parts[activeSegmentIndex]) || 0;
      const delta = e.key === "ArrowUp" ? step : -step;
      parts[activeSegmentIndex] = String(Number((num + delta).toFixed(2)));

      // Save selection position to prevent the cursor from jumping to the end
      const start = input.selectionStart;
      const end = input.selectionEnd;

      textValue = parts.join(" ");

      // Restore cursor positions on the next tick
      setTimeout(() => {
        input.setSelectionRange(start, end);
      }, 0);
    }
  }
</script>

<br />

<div class="vector-wrapper">
  <input
    type="text"
    class="vector-editor"
    bind:value="{textValue}"
    onkeydown={handleKeyDown}
    spellcheck="false"
    autocomplete="off"
  />

  <div class="visual-hints">
    <span class="hint x">X</span>
    <span class="hint y">Y</span>
    <span class="hint z">Z</span>
  </div>
</div>

<style>
  .vector-wrapper {
    position: relative;
    display: inline-block;
    background: #1e1e1e;
    border: 1px solid #333;
    border-radius: 6px;
    padding: 6px 12px;
    font-family:
      "Courier New", Courier, monospace; /* Monospace keeps spacing predictable */
  }

  .vector-editor {
    background: transparent;
    border: none;
    color: #fff;
    font-size: 14px;
    letter-spacing: 2px;
    width: 180px;
    outline: none;
    position: relative;
    z-index: 2;
  }

  /* Subtle backdrop hints so you know what order the numbers are in */
  .visual-hints {
    position: absolute;
    top: -8px;
    left: 12px;
    display: flex;
    gap: 45px;
    font-size: 9px;
    font-weight: bold;
    pointer-events: none;
    z-index: 1;
    font-family: system-ui, sans-serif;
  }

  .hint {
    opacity: 0.5;
    padding: 0 2px;
    border-radius: 2px;
  }
  .x {
    color: #ff4a4a;
  }
  .y {
    color: #4aff4a;
  }
  .z {
    color: #4a4aff;
  }
</style>
