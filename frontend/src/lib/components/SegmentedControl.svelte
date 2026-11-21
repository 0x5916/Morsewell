<script lang="ts" generics="T extends string">
  import { Check } from '@lucide/svelte';

  const id = $props.id();
  let arrowFocus = $state(false);
  let {
    name = id,
    label,
    options,
    value,
    onchange
  }: {
    name?: string;
    label: string;
    options: readonly { value: T; label: string }[];
    value: T;
    onchange: (value: T) => void;
  } = $props();
</script>

<fieldset>
  <legend class="label-text">{label}</legend>
  <div class="segmented" data-arrow-focus={arrowFocus || undefined}>
    {#each options as option (option.value)}
      <label>
        <input
          type="radio"
          {name}
          value={option.value}
          checked={value === option.value}
          onkeydown={(event) => {
            if (event.key.startsWith('Arrow')) arrowFocus = true;
          }}
          onpointerdown={() => (arrowFocus = false)}
          onchange={() => onchange(option.value)}
        />
        <span class="segmented-item"><Check size={16} aria-hidden="true" />{option.label}</span>
      </label>
    {/each}
  </div>
</fieldset>

<style>
  fieldset {
    min-inline-size: 0;
    margin: 0;
    padding: 0;
    border: 0;
  }
  legend {
    margin-block-end: var(--space-1);
    padding: 0;
  }
  .segmented {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: minmax(0, 1fr);
    gap: var(--space-1);
    padding: var(--space-1);
    background: var(--input-bg);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
  }
  label {
    position: relative;
  }
  input {
    position: absolute;
    inset: 0;
    z-index: 1;
    width: 100%;
    height: 100%;
    margin: 0;
    opacity: 0;
    cursor: pointer;
  }
  .segmented-item {
    width: 100%;
    min-height: var(--nav-control-height);
    height: 100%;
    gap: var(--space-1);
    padding-inline: var(--space-1);
    border: 0;
    overflow-wrap: anywhere;
  }
  input:hover + .segmented-item {
    background: var(--bg-inset);
  }
  input:checked + .segmented-item {
    background: var(--selection-bg);
  }
  .segmented-item :global(svg) {
    flex: none;
  }
  input:not(:checked) + .segmented-item :global(svg) {
    display: none;
  }
</style>
