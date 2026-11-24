<script lang="ts">
  import { tick } from 'svelte';
  import type { AnswerSource } from '../../training/v2/types';
  import TrainingKeyboard from '../TrainingKeyboard.svelte';
  import type { phoneKeyboard } from '../phone-keyboard.svelte';
  import { acceptsAnswerReplay } from './keyboard';
  import * as m from '#lib/paraglide/messages.js';

  interface Props {
    keyboard: ReturnType<typeof phoneKeyboard>;
    hasSymbols: boolean;
    listening: boolean;
    onNativeFocusChange: (focused: boolean) => void;
    disabled?: boolean;
    expectedLength?: number;
    autoFocus?: boolean;
    value?: string;
    onReplay?: () => void;
    onSubmit: (text: string, mode: AnswerSource) => void;
  }

  let {
    keyboard,
    hasSymbols,
    listening,
    onNativeFocusChange,
    disabled = false,
    expectedLength = 1,
    autoFocus = true,
    value = $bindable(''),
    onReplay = () => {},
    onSubmit = () => {}
  }: Props = $props();

  let composing = false;
  let field = $state<HTMLInputElement | null>(null);
  const inputId = $props.id();
  let inputLength = $derived(
    Number.isFinite(expectedLength) ? Math.max(1, Math.trunc(expectedLength)) : 1
  );

  function focusWhenReady(input: HTMLInputElement) {
    if (disabled || !autoFocus) return;
    let active = true;
    void tick().then(() => {
      if (active && !disabled && autoFocus) input.focus({ preventScroll: keyboard.active });
    });
    return () => {
      active = false;
    };
  }

  function handleInput(event: Event) {
    if (listening) {
      // Some mobile IMEs emit a non-cancelable edit even when beforeinput is guarded.
      if (field) field.value = value;
      return;
    }
    if (disabled || composing || (event as InputEvent).isComposing) return;
    edit((event.target as HTMLInputElement).value, 'keyboard');
  }

  function edit(text: string, source: AnswerSource) {
    const clean = text.trim().toUpperCase();
    value = clean;
    if (field && field.value !== clean) field.value = clean;

    // Auto-submit when expected single character or group length is reached
    if (clean.length === inputLength) {
      submit(clean, source);
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (disabled || listening || composing || event.isComposing || event.keyCode === 229) return;

    if (acceptsAnswerReplay(event)) {
      event.preventDefault();
      event.stopPropagation();
      onReplay();
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      if (
        !event.repeat &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        !event.shiftKey &&
        value.length === inputLength
      ) {
        submit(value, 'keyboard');
      }
    }
  }

  function submit(text: string, mode: AnswerSource) {
    if (disabled || text.trim() === '') return;
    const finalVal = text.trim().toUpperCase();
    value = '';
    if (field) field.value = '';
    onSubmit(finalVal, mode);
  }
</script>

<div class="answer-input-container" class:phone-answer={keyboard.available}>
  <TrainingKeyboard
    mode={keyboard}
    {field}
    onEdit={edit}
    single={inputLength === 1}
    showSymbols={inputLength > 1 || hasSymbols}
    {disabled}
  >
    <input
      bind:this={field}
      {@attach focusWhenReady}
      type="text"
      class="answer-field"
      class:single={inputLength === 1}
      {value}
      {disabled}
      aria-disabled={listening || undefined}
      maxlength={inputLength}
      style:--answer-length={inputLength}
      autocomplete="off"
      autocorrect="off"
      readonly={keyboard.active}
      inputmode={keyboard.active ? 'none' : 'text'}
      enterkeyhint="done"
      autocapitalize="characters"
      spellcheck="false"
      aria-label={m.lesson_answer_label()}
      aria-describedby={disabled || listening ? undefined : `${inputId}-instruction`}
      onfocus={() => onNativeFocusChange(keyboard.available && !keyboard.active)}
      onblur={() => onNativeFocusChange(false)}
      onbeforeinput={(event) => {
        if (listening) event.preventDefault();
      }}
      oninput={handleInput}
      onkeydown={handleKeydown}
      oncompositionstart={() => (composing = true)}
      oncompositionend={(event) => {
        composing = false;
        handleInput(event);
      }}
    />
    <div
      class:sr-only={inputLength === 1 && !keyboard.available}
      class="input-instruction"
      class:listening
      id={`${inputId}-instruction`}
      hidden={disabled}
    >
      {keyboard.available
        ? inputLength === 1
          ? m.training_answer_single()
          : m.training_answer_group({ count: inputLength })
        : inputLength === 1
          ? m.lesson_type_character()
          : m.lesson_type_group({ count: inputLength })}
    </div>
  </TrainingKeyboard>
</div>

<style>
  .answer-input-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-3);
    width: 100%;
  }

  .answer-field {
    width: min(100%, calc(var(--answer-length) * 1.1em + var(--space-6)));
    min-width: 5.5rem;
    height: 5.5rem;
    background-color: var(--input-bg);
    border: 2px solid var(--border-control);
    border-radius: var(--radius-sm);
    color: var(--text-primary);
    font-family: var(--font-mono);
    font-size: 3rem;
    font-weight: 700;
    text-align: center;
    text-transform: uppercase;
    transition: border-color var(--transition-fast);
  }

  .phone-answer {
    gap: min(8px, var(--space-2));
  }
  .answer-field.single {
    width: 5.5rem;
  }

  /* The OS keyboard can cover the space normally occupied by the three app rows. */
  .phone-answer:has(input[inputmode='text'])::after {
    content: '';
    height: max(
      0px,
      calc(3 * clamp(44px, 6svh, 48px) + 4px - (100svh - var(--session-height, 100svh)))
    );
  }

  .answer-field:focus {
    border-color: var(--focus-color);
    outline: none;
    box-shadow: var(--focus-ring);
  }

  .answer-field:disabled {
    background-color: var(--control-disabled-bg);
    color: var(--control-disabled-fg);
    cursor: not-allowed;
  }

  .input-instruction {
    font-size: var(--text-xs);
    color: var(--text-muted);
  }
  .input-instruction.listening {
    visibility: hidden;
  }
  @media (max-height: 640px) {
    .phone-answer {
      gap: min(4px, var(--space-1));
    }
  }
</style>
