<script lang="ts">
  import { Check, CircleAlert, Play, RotateCcw, Volume2 } from '@lucide/svelte';
  import type { GuidedSessionPhase } from '../../training/v2/guided-session';
  import { acceptsSessionShortcut } from './keyboard';
  import CharacterGrid from './CharacterGrid.svelte';
  import AnswerInput from './AnswerInput.svelte';
  import { phoneKeyboard } from '../phone-keyboard.svelte';
  import type { AnswerSource } from '../../training/v2/types';
  import * as m from '#lib/paraglide/messages.js';
  import { MORSE } from '../../training/sequence';
  import { getLocale } from '#lib/paraglide/runtime.js';

  interface Props {
    phase: GuidedSessionPhase;
    typed?: boolean;
    hasSymbols?: boolean;
    onSkip?: () => void;
    scored: boolean;
    coaching?: boolean;
    assessment?: boolean;
    firstRecall?: boolean;
    introduceFormat?: boolean;
    canPlayNextSound?: boolean;
    replayed?: boolean;
    draft?: string;
    restoredUnscored?: boolean;
    latencyMs?: number;
    options: string[];
    expected: string;
    entered?: string;
    isCorrect?: boolean;
    playingCharacter: string | null;
    audioError: string | null;
    onPlay: () => void;
    onReplay: () => void;
    onSelect: (character: string) => void;
    onSubmit: (text: string, mode: AnswerSource) => void;
    onHear: (character: string) => void;
    onContinue: () => void;
  }

  let {
    phase,
    typed = false,
    hasSymbols = true,
    onSkip,
    scored,
    coaching = false,
    assessment = false,
    firstRecall = false,
    introduceFormat = false,
    canPlayNextSound = false,
    replayed = false,
    draft = $bindable(''),
    restoredUnscored = false,
    latencyMs,
    options,
    expected,
    entered = '',
    isCorrect = false,
    playingCharacter,
    audioError,
    onPlay,
    onReplay,
    onSelect,
    onSubmit,
    onHear,
    onContinue
  }: Props = $props();
  let feedback = $derived(phase === 'feedback');
  const keyboard = phoneKeyboard();
  const phoneResponse = $derived(typed && keyboard.available);
  let playing = $derived(phase === 'playing');
  let nativeFocused = $state(false);
  const keepNativeField = $derived(
    playing && assessment && nativeFocused && phoneResponse && !keyboard.active
  );
  let canPlay = $derived(phase === 'ready' || phase === 'answering');
  const promptId = $props.id();
  function focusHeading(heading: HTMLElement) {
    heading.focus();
  }

  function play() {
    if (feedback && playingCharacter !== expected) onHear(expected);
    else if (phase === 'answering') onReplay();
    else if (phase === 'ready') onPlay();
  }

  function handleKeydown(event: KeyboardEvent) {
    if (
      (canPlay || feedback) &&
      event.code === 'Space' &&
      !event.shiftKey &&
      acceptsSessionShortcut(event)
    ) {
      event.preventDefault();
      play();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<section class="recognition" class:assessment class:feedback class:phone-response={phoneResponse}>
  {#if feedback}
    <header>
      <h1 tabindex="-1" class:correct={isCorrect} {@attach focusHeading}>
        {#if isCorrect}<Check size={24} aria-hidden="true" />
        {:else}<CircleAlert size={24} aria-hidden="true" />{/if}
        {isCorrect
          ? m.lesson_warmup_correct({ character: expected })
          : m.lesson_warmup_expected({ character: expected })}
      </h1>
    </header>
    <div class="sounds">
      {#each isCorrect ? [expected] : [entered, expected] as character (character)}
        {@const correctSound = character === expected}
        {@const label = correctSound
          ? m.lesson_feedback_expected({ character })
          : m.lesson_feedback_entered({ character })}
        {#if character && [...character].every((symbol) => Object.hasOwn(MORSE, symbol))}
          <button
            type="button"
            class="btn-ghost"
            aria-describedby={isCorrect ? undefined : `${promptId}-hear-sound`}
            aria-disabled={playingCharacter === character}
            aria-busy={playingCharacter === character}
            onclick={() => {
              if (playingCharacter !== character) onHear(character);
            }}
          >
            <Volume2 size={20} aria-hidden="true" />
            <span>
              {playingCharacter === character
                ? m.lesson_playing_character({ character })
                : isCorrect
                  ? m.lesson_hear_character({ character })
                  : label}
            </span>
          </button>
        {:else}<span class="unplayable">{label}</span>{/if}
      {/each}
      {#if !isCorrect}<span hidden id={`${promptId}-hear-sound`}>{m.lesson_play_sound()}</span>{/if}
    </div>
    {#if restoredUnscored}<p class="reassurance">{m.lesson_restored_unscored()}</p>
    {:else if scored && isCorrect && latencyMs !== undefined}<p class="reassurance">
        {m.lesson_answer_time({
          seconds: (latencyMs / 1000).toLocaleString(getLocale(), { maximumFractionDigits: 2 })
        })}
      </p>{/if}
    <footer>
      <button type="button" class="btn-primary" aria-keyshortcuts="Enter" onclick={onContinue}>
        {canPlayNextSound ? m.lesson_play_next_sound() : m.lesson_continue()}
      </button>
    </footer>
  {:else}
    {#if playing}
      <h1 class="playback-state">
        <Volume2 size={24} aria-hidden="true" />{assessment
          ? m.check_playing()
          : m.lesson_listening()}
      </h1>
    {:else}
      <header>
        <h1
          tabindex="-1"
          {@attach (heading) => {
            if (phase !== 'answering' || !typed) focusHeading(heading);
          }}
        >
          {phase === 'answering'
            ? m.lesson_prompt_question()
            : typed &&
                !assessment &&
                !coaching &&
                expected.length > 1 &&
                (!introduceFormat || restoredUnscored)
              ? m.lesson_listen_group({ count: expected.length })
              : m.check_listen()}
        </h1>
        {#if phase === 'ready' && introduceFormat && !coaching && !assessment && !restoredUnscored}
          <p>
            {typed
              ? expected.length > 1
                ? m.lesson_group_scored({ count: expected.length })
                : firstRecall && scored
                  ? m.lesson_recall_scored()
                  : m.lesson_prepare_single()
              : scored
                ? m.lesson_choice_scored()
                : m.lesson_warmup_hint()}
          </p>
        {/if}
      </header>
    {/if}
    {#if phase === 'answering' || keepNativeField}
      {#if typed}
        <AnswerInput
          {keyboard}
          {hasSymbols}
          bind:value={draft}
          expectedLength={expected.length}
          listening={keepNativeField}
          onNativeFocusChange={(focused) => (nativeFocused = focused)}
          {onSubmit}
          onReplay={play}
        />
      {:else}
        <CharacterGrid {options} large {onSelect} />
      {/if}
    {/if}
    {#if canPlay || keepNativeField}
      <div
        class="play-controls"
        class:listening={keepNativeField}
        inert={keepNativeField}
        class:with-skip={onSkip && phase !== 'ready'}
      >
        <button
          type="button"
          class={phase === 'ready' ? 'btn-primary' : 'btn-ghost'}
          aria-describedby={phase === 'answering' && (assessment || scored)
            ? `${promptId}-replay`
            : undefined}
          aria-keyshortcuts="Space"
          onclick={play}
        >
          {#if phase !== 'ready'}<RotateCcw size={20} aria-hidden="true" />{m.lesson_replay_sound()}
          {:else}<Play size={20} aria-hidden="true" />{m.lesson_play_sound()}{/if}
          <kbd aria-hidden="true">{m.lesson_key_space()}</kbd>
        </button>
        {#if phase !== 'ready' && assessment}
          <p class="reassurance" id={`${promptId}-replay`}>
            {replayed ? m.check_credit_used() : m.check_replay_cost()}
          </p>
        {:else if phase === 'answering' && scored}
          <p
            class="reassurance"
            class:sr-only={!firstRecall && !phoneResponse}
            class:quiet-replay={!firstRecall && phoneResponse}
            id={`${promptId}-replay`}
          >
            {m.lesson_replay_timing()}
          </p>
        {/if}
        {#if onSkip && phase !== 'ready'}
          <button type="button" class="btn-ghost check-skip" onclick={onSkip}
            >{m.mixed_skip()}</button
          >
        {/if}
      </div>
    {/if}
    {#if !typed && phase !== 'answering'}
      <CharacterGrid {options} large disabled {onSelect} />
    {/if}
    {#if canPlay && restoredUnscored}<p class="reassurance">{m.lesson_restored_unscored()}</p>{/if}
    {#if audioError}<p class="notice" role="alert">{m.lesson_feedback_audio_error()}</p>
    {:else if assessment && phase === 'ready'}<p>{m.check_audio_tap()}</p>{/if}
  {/if}
</section>

<style>
  .recognition {
    width: 100%;
    max-width: 30rem;
    min-height: min(36rem, calc(100dvh - 8rem));
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
    padding-block: var(--space-4);
  }
  .recognition.feedback {
    gap: min(var(--space-6), 24px);
    padding-block: min(var(--space-4), 16px);
  }
  header {
    min-height: 0;
  }
  h1 {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-3);
    margin: 0;
    font-size: var(--text-2xl);
    font-weight: 600;
    line-height: var(--leading-tight);
  }
  header h1 :global(svg) {
    flex-shrink: 0;
    color: var(--status-bad);
  }
  h1:focus {
    outline: none;
  }
  header h1.correct :global(svg) {
    color: var(--status-good);
  }
  p {
    margin: 0;
    color: var(--text-secondary);
  }
  header p {
    margin-top: var(--space-3);
  }
  .sounds {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 10rem), 1fr));
    gap: min(var(--space-4), 16px);
  }
  .sounds button {
    padding: min(var(--space-3), 12px);
    gap: min(var(--space-2), 8px);
  }
  .sounds button span {
    text-wrap: balance;
  }
  .unplayable {
    align-self: center;
    overflow-wrap: anywhere;
  }
  .play-controls {
    display: grid;
    gap: var(--space-2);
  }
  .play-controls.listening {
    visibility: hidden;
  }
  kbd {
    font: inherit;
    font-size: var(--text-xs);
    opacity: 0.8;
  }
  button :global(svg) {
    flex-shrink: 0;
  }
  button {
    width: 100%;
    min-width: 0;
    white-space: normal;
    overflow-wrap: anywhere;
    min-height: 3.5rem;
    gap: var(--space-2);
    padding: var(--space-3);
    font-size: var(--text-base);
  }
  .btn-ghost {
    border: 1px solid var(--border-control);
  }
  button[aria-disabled='true'] {
    color: var(--text-muted);
    cursor: wait;
  }
  .notice {
    color: var(--status-bad);
  }
  .reassurance {
    font-size: var(--text-sm);
    color: var(--text-muted);
  }
  .assessment {
    min-height: auto;
    gap: var(--space-8);
    padding-block: 0;
  }
  .recognition.phone-response {
    flex: 1 0 auto;
    min-height: 0;
    gap: min(var(--space-3), 12px);
    padding-block: 0;
  }
  .phone-response :global(.answer-input-container),
  .phone-response.feedback .sounds {
    margin-block-start: auto;
  }
  .phone-response .play-controls button {
    min-height: 48px;
  }
  .check-skip {
    width: auto;
    min-width: min(7rem, 100%);
    justify-self: center;
  }
  .phone-response .with-skip {
    grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
  }
  .phone-response .with-skip p {
    grid-column: 1 / -1;
  }
  .phone-response .check-skip {
    grid-area: 1 / 2;
    width: 100%;
    min-width: 0;
  }
  @container (width < 17rem) {
    .phone-response .with-skip {
      grid-template-columns: minmax(0, 1fr);
    }
    .phone-response .check-skip {
      grid-area: auto;
    }
  }
  .quiet-replay {
    opacity: 0;
    pointer-events: none;
    user-select: none;
  }
  @media (max-height: 640px) {
    .recognition.phone-response {
      gap: min(var(--space-2), 8px);
    }
    .recognition.phone-response header {
      margin-block-end: 0;
    }
  }
  .assessment header {
    min-height: auto;
    margin-bottom: var(--space-2);
  }
  .assessment .playback-state {
    margin-top: var(--space-4);
  }
  .assessment button {
    min-height: calc(var(--answer-target-min) + var(--space-1));
    font-weight: 600;
    border-color: var(--border);
  }
  @media (any-pointer: coarse) {
    kbd {
      display: none;
    }
  }
</style>
