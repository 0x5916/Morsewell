<script lang="ts">
  import { ChevronRight, Clock3 } from '@lucide/svelte';
  import { onDestroy, tick, untrack } from 'svelte';
  import type { PracticeContext } from '../../training/contextual-practice';
  import { getLessonChars, LESSONS } from '../../training/sequence';
  import { canCheck } from '../../training/session';
  import {
    createCopyAttempt,
    emptyCopyAttempt,
    copyPlaybackEvent,
    reviewCopyAttempt,
    restoreCopyAttempt,
    copyInputLimit,
    selectedGroupLesson,
    boundCopyInput,
    type CopyAttempt
  } from '../../practice/copy-attempt';
  import { normalizePlaybackSettings } from '../../practice/playback';
  import { practiceKeyIntent } from '../../practice/keyboard';
  import { formatClock, formatPercent } from '../../format';
  import MorsePlayer from '../MorsePlayer.svelte';
  import ResultOverlay from '../ResultOverlay.svelte';
  import ExitSessionDialog from '../learning/ExitSessionDialog.svelte';
  import * as m from '#lib/paraglide/messages.js';

  interface Props {
    lesson?: number;
    resume?: import('../../data/session-checkpoints').CopyCheckpoint | null;
    onCheckpoint?: (attempt: CopyAttempt, draft: string) => void;
    charWpm?: number;
    effWpm?: number;
    freq?: number;
    volume?: number;
    startDelay?: number;
    onStart?: () => void;
    onReview?: (attempt: CopyAttempt) => void;
    onFinish?: () => void;
    persistenceStatus?: 'saving' | 'saved' | 'failed' | null;
    onRetrySave?: () => void;
  }

  let {
    lesson = 1,
    resume = null,
    onCheckpoint,
    charWpm = 20,
    effWpm = 12,
    freq = 600,
    volume = 1.0,
    startDelay = 0.5,
    onStart,
    onReview,
    onFinish,
    persistenceStatus = null,
    onRetrySave
  }: Props = $props();

  let settings = $state(normalizePlaybackSettings({}));
  let attempt = $state.raw(emptyCopyAttempt());
  let activeLesson = $derived(selectedGroupLesson(attempt, lesson));
  let session = $derived(attempt.session);
  let lessonText = $derived(attempt.exercise.text);

  let context = $state<PracticeContext>('groups');
  let editSetup = $state(false);
  const setupId = $props.id();
  let inputText = $state('');
  let result = $derived(attempt.review?.result.accuracy ?? -1);
  let showOverlay = $state(false);
  let comparison = $derived(attempt.review?.comparison);
  let playbackPaused = $state(false);
  let answerEl = $state<HTMLTextAreaElement | null>(null);
  let discardOpen = $state(false);
  let discardReturnFocus = $state<HTMLElement | null>(null);
  let resolveDiscard: ((confirmed: boolean) => void) | null = null;
  let destroyed = false;

  let player = $state<{
    playNow: () => Promise<void>;
    stopNow: () => Promise<void>;
    isStarted: () => boolean;
    focusPlay: () => void;
  } | null>(null);
  let savePending = $derived(persistenceStatus === 'saving' || persistenceStatus === 'failed');

  $effect.pre(() => {
    const next = normalizePlaybackSettings({ charWpm, effWpm, freq, volume, startDelay });
    const nextLesson = lesson;
    untrack(() => {
      settings = next;
      if (resume) {
        const restored = restoreCopyAttempt(resume.attempt, resume.draft);
        settings = restored.settings;
        context = restored.exercise.context ?? 'groups';
        attempt = restored;
        inputText = resume.draft;
        showOverlay = Boolean(restored.review);
        onStart?.();
        if (restored.review) onReview?.(restored);
      } else regenerate(nextLesson);
    });
  });

  $effect(() => {
    const current = attempt,
      draft = inputText;
    untrack(() => onCheckpoint?.(current, draft));
  });

  let currentLessonChars = $derived(getLessonChars(activeLesson).split(''));

  let transportLive = $derived(session.status === 'playing' || session.status === 'paused');
  let sessionStarted = $derived(session.status !== 'ready' && session.status !== 'disposed');
  let checkEnabled = $derived(canCheck(session) && inputText.trim() !== '');
  let unfinished = $derived(result < 0 && (inputText.trim() !== '' || session.status !== 'ready'));

  const setupLabel = $derived(
    context === 'groups'
      ? m.practice_history_groups({ step: activeLesson })
      : context === 'words'
        ? m.context_words()
        : context === 'callsigns'
          ? m.context_callsigns()
          : m.context_contact()
  );
  const playbackStatus = $derived(
    result >= 0
      ? playbackPaused
        ? m.practice_review_replay_paused()
        : transportLive
          ? m.practice_review_replaying()
          : m.trainer_state_checked()
      : playbackPaused
        ? m.practice_paused()
        : transportLive
          ? m.trainer_state_listening()
          : m.trainer_state_idle()
  );

  function regenerate(nextLesson = activeLesson) {
    if (savePending) return;
    void player?.stopNow();
    attempt = {
      ...createCopyAttempt(nextLesson, settings, attempt, undefined, context),
      id: crypto.randomUUID()
    };
    inputText = '';
    showOverlay = false;
  }

  async function confirmReplaceExercise(): Promise<boolean> {
    if (destroyed || savePending || resolveDiscard) return false;
    if (!unfinished) return true;
    const exercise = attempt.exercise;
    discardReturnFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    void player?.stopNow();
    discardOpen = true;
    const confirmed = await new Promise<boolean>((resolve) => (resolveDiscard = resolve));
    return confirmed && !destroyed && !savePending && attempt.exercise === exercise;
  }

  function finishDiscardDecision(confirmed: boolean) {
    const resolve = resolveDiscard;
    resolveDiscard = null;
    discardOpen = false;
    resolve?.(confirmed);
  }

  async function requestNewExercise() {
    if (await confirmReplaceExercise()) await startNewExercise();
  }

  async function startNewExercise() {
    if (savePending) return;
    regenerate();
    await tick();
    if (!destroyed) player?.focusPlay();
  }

  async function applySelection(select: HTMLSelectElement, nextLesson = activeLesson) {
    regenerate(nextLesson);
    await tick();
    if (!destroyed && !select.isConnected) player?.focusPlay();
  }

  async function selectContext(event: Event) {
    const select = event.currentTarget as HTMLSelectElement;
    const next = select.value as PracticeContext;
    select.value = context;
    if (next !== context && (await confirmReplaceExercise())) {
      context = next;
      await applySelection(select);
    }
  }

  async function selectLesson(event: Event) {
    const select = event.currentTarget as HTMLSelectElement;
    const nextLesson = Number(select.value);
    select.value = String(activeLesson);
    if (nextLesson !== activeLesson && (await confirmReplaceExercise()))
      await applySelection(select, nextLesson);
  }

  export function focusCopy() {
    answerEl?.focus();
  }
  export function hasUnfinishedCopy() {
    return unfinished;
  }
  export function prepareToLeave() {
    void player?.stopNow();
    showOverlay = false;
    finishDiscardDecision(false);
  }
  async function finishPractice() {
    prepareToLeave();
    await tick();
    onFinish?.();
  }

  async function handleStart() {
    onStart?.();
    editSetup = false;
    attempt = copyPlaybackEvent(attempt, 'start');
    // Focus as soon as the field exists, before the learner can choose another control.
    await tick();
    if (!destroyed && !showOverlay && !discardOpen && sessionStarted && !attempt.review) {
      answerEl?.focus({ preventScroll: true });
    }
  }

  function handleEnded() {
    attempt = copyPlaybackEvent(attempt, 'stop');
  }

  function handleCheck() {
    if (!checkEnabled) return;
    void player?.stopNow();
    attempt = reviewCopyAttempt(attempt, inputText);
    onReview?.(attempt);
    showOverlay = true;
  }

  function onPracticeKeydown(event: KeyboardEvent) {
    if (showOverlay || discardOpen) return;
    const intent = practiceKeyIntent(event);
    if (intent === 'check' && sessionStarted) {
      event.preventDefault();
      if (checkEnabled) handleCheck();
    } else if (intent === 'stop' && transportLive) {
      event.preventDefault();
      void player?.stopNow();
    } else if (intent === 'replay') {
      event.preventDefault();
      void player?.playNow();
    }
  }

  onDestroy(() => {
    destroyed = true;
    finishDiscardDecision(false);
  });
</script>

<svelte:window onkeydown={onPracticeKeydown} />

<div
  class="continuous-copy-practice"
  class:ready={!sessionStarted}
  role="region"
  aria-label={m.practice_copy_region()}
>
  {#snippet selectors()}
    <div class="console-head">
      <label class="field"
        ><span class="label-text">{m.context_label()}</span><select
          class="select"
          value={context}
          onchange={selectContext}
          disabled={savePending}
        >
          <option value="groups">{m.context_groups()}</option><option value="words"
            >{m.context_words()}</option
          ><option value="callsigns">{m.context_callsigns()}</option><option value="contact"
            >{m.context_contact()}</option
          >
        </select></label
      >
      {#if context === 'groups'}
        <label class="field">
          <span class="label-text">{m.trainer_current_lesson()}</span>
          <select
            class="select"
            value={activeLesson}
            onchange={selectLesson}
            disabled={savePending}
          >
            {#each LESSONS as characters, index (index)}
              <option value={index + 1}
                >{m.practice_lesson_adds({
                  step: index + 1,
                  characters: characters.split('').join(', ')
                })}</option
              >
            {/each}
          </select>
        </label>
        <details class="character-details">
          <summary class="training-disclosure"
            >{m.practice_character_count({ count: currentLessonChars.length })}</summary
          >
          <p>{currentLessonChars.join(' ')}</p>
        </details>
      {:else}
        <p class="character-details">
          {context === 'words'
            ? m.practice_word_count()
            : context === 'callsigns'
              ? m.practice_callsign_count()
              : m.practice_contact_description()}
        </p>
      {/if}
    </div>
  {/snippet}
  <div class="passage-setup">
    {#if sessionStarted}
      <details class="setup-details">
        <summary class="training-disclosure">{setupLabel}</summary>
        {@render selectors()}
      </details>
    {:else}
      <div class="compact-setup">
        <p>{setupLabel}</p>
        {#if context === 'groups'}
          <p class="compact-characters">
            {currentLessonChars.length <= 6
              ? currentLessonChars.join(' ')
              : m.practice_character_count({ count: currentLessonChars.length })}
          </p>
        {/if}
        <button
          type="button"
          class="setup-toggle"
          aria-expanded={editSetup}
          aria-controls={setupId}
          onclick={() => (editSetup = !editSetup)}
          ><ChevronRight size={16} aria-hidden="true" />{m.practice_change_setup()}</button
        >
      </div>
      <div class="ready-selectors" class:editing={editSetup} id={setupId}>
        {@render selectors()}
      </div>
    {/if}
  </div>

  {#if sessionStarted}
    <p class="session-state" role="status">{playbackStatus}</p>
  {:else if lessonText}
    <p class="session-state ready-cue">
      <span class="audio-length"
        ><Clock3 size={16} aria-hidden="true" /><span class="sr-only"
          >{m.practice_audio_length()}
        </span>{formatClock(attempt.duration)}</span
      >
      <span class="copy-cue"
        >{context === 'groups' ? m.practice_groups_cue() : m.practice_passage_cue()}</span
      >
    </p>
  {/if}
  {#snippet answerControls()}
    <div class="answer-section" class:hidden={!sessionStarted}>
      {#if sessionStarted}
        <label class="field">
          <span class="label-text">{m.trainer_answer_label()}</span>
          <textarea
            bind:this={answerEl}
            bind:value={() => inputText, (value) => (inputText = boundCopyInput(lessonText, value))}
            class="textarea copy-textarea"
            readonly={result >= 0}
            maxlength={copyInputLimit(lessonText)}
            autocapitalize="characters"
            autocomplete="off"
            spellcheck="false"></textarea>
        </label>
      {/if}

      {#if result >= 0}
        <p class="result-line" aria-live="polite">
          {m.trainer_result_last({ percent: formatPercent(result) })}
          <button type="button" class="quiet-btn" onclick={() => (showOverlay = true)}>
            {m.trainer_result_review()}
          </button>
        </p>
      {/if}

      <div class="action-row">
        {#if sessionStarted && result < 0}
          <button
            type="button"
            class="btn-primary"
            aria-keyshortcuts="Control+Enter Meta+Enter"
            onclick={handleCheck}
            disabled={!checkEnabled}
            >{m.trainer_check()}<kbd class="score-shortcut" aria-hidden="true">Ctrl / ⌘ + Enter</kbd
            ></button
          >
        {/if}
        {#if sessionStarted}
          <button
            type="button"
            class="btn-ghost"
            onclick={requestNewExercise}
            disabled={savePending}>{m.trainer_try_again()}</button
          >
        {/if}
        {#if persistenceStatus === 'failed'}<button
            type="button"
            class="btn-ghost"
            onclick={() => {
              showOverlay = true;
              onRetrySave?.();
            }}>{m.lesson_retry_save()}</button
          >{/if}
      </div>
    </div>
  {/snippet}
  <div class="player-wrapper">
    {#key context}<MorsePlayer
        exposureSource={context === 'words'
          ? 'word'
          : context === 'callsigns'
            ? 'callsign'
            : 'group'}
        bind:this={player}
        text={lessonText}
        bind:charWpm={settings.charWpm}
        bind:effWpm={settings.effWpm}
        bind:freq={settings.freq}
        bind:volume={settings.volume}
        bind:startDelay={settings.startDelay}
        onVolumeChange={(volume) => {
          attempt = { ...attempt, settings: { ...attempt.settings, volume } };
        }}
        onBeforeSettingsInput={confirmReplaceExercise}
        onSettingsInput={() => regenerate()}
        showSettings
        practiceLayout
        afterTransport={answerControls}
        playTone={sessionStarted ? 'quiet' : 'primary'}
        showTransportExtras={transportLive}
        onStart={handleStart}
        onEnded={handleEnded}
        playLabel={sessionStarted ? m.trainer_replay() : m.practice_start()}
        onPausedChange={(paused) => (playbackPaused = paused)}
      />{/key}
  </div>

  {#if showOverlay && comparison}
    <ResultOverlay
      {result}
      {comparison}
      contentLabel={context === 'groups'
        ? undefined
        : context === 'words'
          ? m.context_words()
          : context === 'callsigns'
            ? m.context_callsigns()
            : m.context_contact()}
      lessonNum={activeLesson}
      sourceText={lessonText}
      onClose={() => (showOverlay = false)}
      fallbackFocus={answerEl}
      onFinish={() => void finishPractice()}
      onRegenerate={() => void startNewExercise()}
      {persistenceStatus}
      {onRetrySave}
    />
  {/if}
</div>

<ExitSessionDialog
  isOpen={discardOpen}
  title={m.practice_replace_title()}
  description={m.trainer_discard_description()}
  confirmLabel={m.trainer_discard_action()}
  cancelLabel={m.practice_keep_copy()}
  returnFocusTo={discardReturnFocus}
  fallbackFocus={answerEl}
  onConfirm={() => finishDiscardDecision(true)}
  onCancel={() => finishDiscardDecision(false)}
/>

<style>
  .continuous-copy-practice {
    --practice-card-padding: var(--space-6);
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-3);
    width: 100%;
    isolation: isolate;
    container: copy-practice / inline-size;
  }
  .continuous-copy-practice::before {
    content: '';
    grid-column: 1;
    grid-row: 1 / 7;
    background: var(--bg-surface);
    border-radius: var(--radius-lg);
    z-index: -1;
  }
  .passage-setup {
    grid-column: 1;
    grid-row: 1;
    margin: var(--practice-card-padding) var(--practice-card-padding) 0;
    min-width: 0;
  }
  .compact-setup {
    display: none;
  }
  @container copy-practice (width < 16rem) {
    .compact-setup {
      display: grid;
      gap: var(--space-1);
      overflow-wrap: anywhere;
    }
    .compact-setup p {
      margin: 0;
    }
    .compact-characters {
      color: var(--text-secondary);
      font-size: var(--text-sm);
    }
    .setup-toggle {
      display: inline-flex;
      align-items: center;
      justify-self: start;
      gap: var(--space-1);
      min-height: max(44px, 2em);
      max-width: 100%;
      padding: 0;
      border: 0;
      background: transparent;
      color: var(--accent);
      font: inherit;
      text-align: start;
      cursor: pointer;
    }
    .setup-toggle :global(svg) {
      flex: none;
    }
    .setup-toggle[aria-expanded='true'] :global(svg) {
      transform: rotate(90deg);
    }
    .ready-selectors:not(.editing) {
      display: none;
    }
    .session-state.ready-cue {
      display: contents;
    }
    .ready-cue .audio-length,
    .ready-cue .copy-cue {
      grid-column: 1;
      margin-inline: var(--practice-card-padding);
    }
    .ready-cue .audio-length {
      grid-row: 2;
      margin-bottom: var(--space-2);
    }
    .ready-cue .copy-cue {
      grid-row: 5;
      margin-bottom: var(--practice-card-padding);
      font-size: var(--text-sm);
    }
  }
  .setup-details summary {
    min-height: var(--answer-target-min);
    padding-block: var(--space-2);
  }
  .setup-details[open] .console-head {
    margin-top: var(--space-2);
  }
  .console-head {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-4);
    align-items: center;
  }
  .console-head .field {
    grid-column: 1 / -1;
  }
  .console-head select {
    min-height: 3.25rem;
  }
  .character-details {
    font-size: var(--text-sm);
  }
  .character-details summary {
    min-height: var(--nav-control-height);
    padding-block: var(--space-2);
  }
  .character-details p {
    max-width: 24rem;
    overflow-wrap: anywhere;
    font-family: var(--font-mono);
    margin: 0 0 var(--space-2);
  }
  .session-state {
    grid-column: 1;
    grid-row: 2;
    margin-inline: var(--practice-card-padding);
    margin-block: 0;
    font-size: var(--text-base);
    color: var(--text-secondary);
  }
  .ready-cue {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-1) var(--space-3);
    margin-bottom: var(--space-3);
  }
  .audio-length {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    font-variant-numeric: tabular-nums;
  }
  .player-wrapper {
    display: contents;
  }
  .answer-section {
    grid-column: 1;
    grid-row: 5;
    margin: 0 var(--practice-card-padding) var(--practice-card-padding);
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  .copy-textarea {
    width: 100%;
    min-height: 9rem;
    font-family: var(--font-mono);
    font-size: var(--text-lg);
    text-transform: uppercase;
  }
  .result-line {
    margin: 0;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--space-2);
    font-size: var(--text-sm);
  }
  .quiet-btn {
    background: none;
    border: none;
    color: var(--accent);
    cursor: pointer;
    font: inherit;
    min-height: var(--answer-target-min);
  }
  .score-shortcut {
    display: none;
  }
  @media (hover: hover) and (pointer: fine) {
    .score-shortcut {
      display: inline;
      font: var(--text-xs) var(--font-mono);
      margin-inline-start: var(--space-2);
    }
  }
  .action-row {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
  }
  .action-row button {
    min-height: var(--answer-target-min);
  }
  @media (max-width: 480px) {
    .action-row {
      flex-direction: column;
    }
    .action-row button {
      max-width: 100%;
      padding-inline: min(var(--space-4), 4%);
      overflow-wrap: anywhere;
    }
  }
  .ready {
    row-gap: 0;
  }
  .ready :global(.player-playhead) {
    display: none;
  }
  .ready .passage-setup {
    margin-bottom: var(--space-2);
  }
  .ready :global(.player-media-controls) {
    margin-bottom: var(--practice-card-padding);
  }
  .ready :global(.player-settings-region) {
    margin-top: var(--space-4);
  }
  @media (max-width: 959px) {
    .continuous-copy-practice {
      --practice-card-padding: min(var(--space-4), 5vw);
    }
  }
  .answer-section.hidden {
    display: none;
  }
</style>
