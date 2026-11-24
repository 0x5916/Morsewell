<script lang="ts">
  import { Delete, Keyboard } from '@lucide/svelte';
  import { flushSync, type Snippet } from 'svelte';
  import type { phoneKeyboard } from './phone-keyboard.svelte';
  import * as m from '#lib/paraglide/messages.js';

  type KeySource = 'keyboard' | 'full-alphabet' | 'touch';

  let {
    mode,
    field,
    onEdit,
    lessonCharacters,
    single = false,
    showSymbols = true,
    disabled = false,
    children
  }: {
    mode: ReturnType<typeof phoneKeyboard>;
    field: HTMLInputElement | HTMLTextAreaElement | null;
    onEdit: (value: string, source: KeySource) => void;
    lessonCharacters?: readonly string[];
    single?: boolean;
    showSymbols?: boolean;
    disabled?: boolean;
    children: Snippet;
  } = $props();
  let numbers = $state(false);
  const rows = [
    { letters: 'QWERTYUIOP', symbols: '12345' },
    { letters: 'ASDFGHJKL', symbols: '67890' },
    { letters: 'ZXCVBNM', symbols: '.,/?' }
  ];
  const allowedKeys = $derived(mode.lessonKeysOnly ? lessonCharacters : undefined);
  const symbolNames: Record<string, () => string> = {
    '.': m.training_key_period,
    ',': m.training_key_comma,
    '/': m.training_key_slash,
    '?': m.training_key_question
  };

  function edit(key: string, source: KeySource) {
    if (!field || disabled || !mode.active || field.disabled) return;
    let start = field.selectionStart ?? field.value.length;
    let end = field.selectionEnd ?? start;
    const erase = key === 'Backspace' || key === 'Delete';
    if (erase && start === end) {
      if (key === 'Backspace') start -= [...field.value.slice(0, start)].at(-1)?.length ?? 0;
      else end += [...field.value.slice(end)][0]?.length ?? 0;
      if (start === end) return;
    }
    const insert = erase ? '' : key;
    if (field.value.length - (end - start) + insert.length > field.maxLength) return;
    field.setRangeText(insert, start, end, 'end');
    onEdit(field.value, source);
  }

  function physicalKey(event: KeyboardEvent) {
    if (
      disabled ||
      !mode.active ||
      event.target !== field ||
      event.defaultPrevented ||
      event.repeat ||
      event.isComposing ||
      event.keyCode === 229 ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey
    )
      return;
    const key = event.key === 'Enter' && field instanceof HTMLTextAreaElement ? '\n' : event.key;
    if (key.length !== 1 && key !== 'Backspace' && key !== 'Delete') return;
    event.preventDefault();
    edit(key, 'keyboard');
  }

  function press(event: MouseEvent, key: string) {
    edit(key, allowedKeys ? 'touch' : 'full-alphabet');
    if (event.detail) field?.focus({ preventScroll: true });
  }

  function switchLayer(event: MouseEvent) {
    numbers = !numbers;
    if (event.detail) field?.focus({ preventScroll: true });
  }

  function switchMode() {
    const start = field?.selectionStart;
    const end = field?.selectionEnd;
    field?.blur();
    flushSync(() => mode.switchMode());
    field?.focus({ preventScroll: true });
    if (start != null && end != null) field?.setSelectionRange(start, end);
  }

  function revealPassageKeys(board: HTMLElement) {
    const frame = requestAnimationFrame(() => {
      if (!(field instanceof HTMLTextAreaElement)) return;
      const bottom = board.getBoundingClientRect().bottom;
      const clearance = parseFloat(getComputedStyle(board).scrollMarginBlockEnd);
      // On a short landscape screen, keep the editor in view and allow ordinary scrolling.
      if (bottom + clearance - field.getBoundingClientRect().top <= window.innerHeight)
        board.scrollIntoView({ block: 'nearest', behavior: 'instant' });
    });
    return () => cancelAnimationFrame(frame);
  }
</script>

<svelte:window onkeydown={physicalKey} />

{#if mode.available && !disabled}
  <div class="keyboard-options">
    {#if lessonCharacters}
      <label class="lesson-filter" class:reserved={!mode.active} inert={!mode.active}>
        <input type="checkbox" bind:checked={mode.lessonKeysOnly} />
        {m.training_lesson_keys_only()}
      </label>
    {/if}
    <button type="button" class="action-quiet switch" onclick={switchMode}>
      <Keyboard size={16} aria-hidden="true" />
      <span class="switch-label">
        <span class:reserved={!mode.active}>{m.training_use_phone()}</span>
        <span class:reserved={mode.active}>{m.training_use_app()}</span>
      </span>
    </button>
  </div>
{/if}
<!-- iOS needs a fresh editable field to open its keyboard from the switch gesture. -->
{#key mode.active}{@render children()}{/key}
{#if mode.active && !disabled}
  <div
    class="training-keyboard"
    class:numbers
    role="group"
    aria-label={m.training_keyboard()}
    {@attach revealPassageKeys}
  >
    <div class="keys" class:single class:letters-only={!showSymbols}>
      {#each rows as row, i (row.letters)}
        <div class="key-row">
          {#if i === rows.length - 1 && showSymbols}
            <button
              type="button"
              class="key layer"
              aria-label={numbers ? m.training_letters() : m.training_numbers()}
              onclick={switchLayer}
            >
              <span class="cap">{numbers ? 'ABC' : '123'}</span>
            </button>
          {/if}
          {#each numbers ? row.symbols : row.letters as key (key)}
            <button
              type="button"
              class="key character"
              disabled={allowedKeys !== undefined && !allowedKeys.includes(key)}
              aria-label={symbolNames[key]?.()}
              onclick={(event) => press(event, key)}><span class="cap">{key}</span></button
            >
          {/each}
          {#if i === rows.length - 1 && !single}
            <button
              type="button"
              class="key backspace"
              aria-label={m.training_key_backspace()}
              onclick={(event) => press(event, 'Backspace')}
            >
              <span class="cap"><Delete size={20} aria-hidden="true" /></span>
            </button>
          {/if}
        </div>
      {/each}
    </div>
    {#if field?.tagName === 'TEXTAREA'}
      <button type="button" class="key space" onclick={(event) => press(event, ' ')}>
        <span class="cap">{m.lesson_key_space()}</span>
      </button>
    {/if}
  </div>
{/if}

<style>
  .keyboard-options {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    column-gap: var(--space-2);
    width: 100%;
  }
  .switch {
    margin-inline-start: auto;
    max-width: 100%;
    min-height: 44px;
    gap: var(--space-1);
    padding-inline: 0;
    color: var(--text-secondary);
  }
  .switch :global(svg) {
    flex: none;
  }
  .switch-label {
    display: grid;
    text-align: start;
  }
  .switch-label span {
    grid-area: 1 / 1;
  }
  .reserved {
    visibility: hidden;
  }
  .lesson-filter {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-height: 44px;
    font-size: var(--text-sm);
    cursor: pointer;
  }
  .lesson-filter input {
    accent-color: var(--accent);
  }
  .lesson-filter input:focus-visible {
    outline: 2px solid var(--focus-color);
    outline-offset: 2px;
  }
  .training-keyboard {
    --edge: max(4px, env(safe-area-inset-left, 0px), env(safe-area-inset-right, 0px));
    align-self: center;
    width: min(
      calc(100% + 2 * var(--keyboard-outset, var(--space-6))),
      calc(100dvw - 2 * var(--edge)),
      var(--session-max-width)
    );
    display: grid;
    scroll-margin-block-end: calc(var(--bottom-nav-height, 0px) + var(--space-2));
    grid-template-columns: minmax(0, 1fr);
    padding: 2px;
    border-radius: var(--radius-lg);
    background: var(--bg-inset);
  }
  .key-row {
    display: flex;
  }
  .key-row:nth-child(2) {
    margin-inline: 5%;
  }
  .numbers .key-row:nth-child(2) {
    margin-inline: 0;
  }
  .layer {
    container-type: inline-size;
  }
  .key-row .layer,
  .key-row .backspace {
    flex: 0 0 15%;
  }
  /* Vacant action slots preserve the bottom row's QWERTY stagger. */
  .letters-only .key-row:last-child::before,
  .single .key-row:last-child::after {
    content: '';
    flex: 0 0 15%;
  }
  .key {
    display: grid;
    flex: 1 1 0;
    min-width: 0;
    min-height: clamp(44px, 6svh, 48px);
    /* The visual gutter belongs to the button, so taps between caps still register. */
    padding: 2px;
    border: 0;
    background: transparent;
    color: var(--text-primary);
    font: 500 var(--text-lg) / 1.1 var(--font-mono);
    cursor: pointer;
    touch-action: manipulation;
  }
  .cap {
    display: grid;
    place-items: center;
    min-width: 0;
    border: 1px solid var(--border);
    border-block-end-color: var(--border-control);
    border-radius: var(--radius-md);
    background: var(--bg-surface);
  }
  .layer .cap,
  .backspace .cap {
    background: var(--bg-base);
    color: var(--text-secondary);
  }
  .layer,
  .space {
    font-family: inherit;
    font-size: var(--text-sm);
    font-weight: 600;
  }
  .layer .cap {
    /* Keep all three characters legible within the fixed stagger at enlarged text sizes. */
    font-size: min(var(--text-sm), 43cqi);
  }
  .key:focus-visible {
    outline: none;
  }
  .key:focus-visible .cap {
    outline: 2px solid var(--focus-color);
    outline-offset: -2px;
  }
  .key:active:enabled .cap {
    background: var(--accent-pressed);
    color: var(--on-accent);
    border-color: var(--accent-pressed);
  }
  .key:disabled {
    cursor: default;
  }
  .key:disabled .cap {
    background: var(--control-disabled-bg);
    color: var(--control-disabled-fg);
    border-color: var(--border);
  }
  @media (prefers-contrast: more) {
    .key:enabled .cap {
      border-color: var(--border-control);
    }
  }
</style>
