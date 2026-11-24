<script lang="ts">
  import type { Snippet } from 'svelte';
  import { browser } from '$app/env';
  import { ArrowLeft, Pause, Play } from '@lucide/svelte';
  import SessionProgress from './SessionProgress.svelte';
  import ExitSessionDialog from './ExitSessionDialog.svelte';
  import { acceptsSessionEscape } from './keyboard';
  import * as m from '#lib/paraglide/messages.js';

  interface Props {
    phaseLabel?: string;
    currentPromptIndex: number;
    totalPrompts: number;
    isPaused?: boolean;
    canPause?: boolean;
    complete?: boolean;
    review?: boolean;
    assessment?: boolean;
    checkInterrupted?: boolean;
    saveWouldInvalidateCheck?: boolean;
    busy?: boolean;
    onExit: () => void;
    onSaveLeave?: () => void;
    onExitRequest?: () => void;
    onExitCancel?: () => void;
    onPauseToggle?: () => void;
    children?: Snippet;
    pauseDetails?: Snippet;
    showExitConfirm?: boolean;
  }

  let {
    phaseLabel,
    currentPromptIndex = 0,
    totalPrompts = 1,
    isPaused = false,
    canPause = true,
    complete = false,
    review = false,
    assessment = false,
    checkInterrupted = false,
    saveWouldInvalidateCheck = false,
    busy = false,
    onExit = () => {},
    onSaveLeave,
    onExitRequest = () => {},
    onExitCancel = () => {},
    onPauseToggle = () => {},
    children,
    pauseDetails,
    showExitConfirm = $bindable(false)
  }: Props = $props();

  let confirmCheckSave = $state(false);
  let saveButton = $state<HTMLButtonElement | null>(null);
  let exitButton = $state<HTMLButtonElement | null>(null);
  let returnFocusTo = $state<HTMLElement | null>(null);

  const exitLabel = $derived.by(() => (review ? m.review_exit() : m.lesson_exit()));
  const pauseLabel = $derived.by(() => {
    if (isPaused && checkInterrupted) return m.check_continue_practice();
    if (isPaused) return assessment ? m.check_resume() : m.lesson_resume();
    return assessment ? m.mixed_pause() : review ? m.review_pause() : m.lesson_pause();
  });

  function handleExitClick() {
    if (showExitConfirm || busy) return;
    if (complete) return onExit();
    returnFocusTo =
      browser && document.activeElement instanceof HTMLElement ? document.activeElement : null;
    onExitRequest();
    showExitConfirm = true;
  }

  function handleKeydown(event: KeyboardEvent) {
    if (showExitConfirm || confirmCheckSave || !acceptsSessionEscape(event)) return;
    event.preventDefault();
    if (assessment && !isPaused && !complete) onPauseToggle();
    else handleExitClick();
  }

  function handleConfirmExit() {
    showExitConfirm = false;
    onExit();
  }

  function handleCancelExit() {
    showExitConfirm = false;
    onExitCancel();
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div
  class={['session-shell', complete && 'session-shell--complete', assessment && 'assessment']}
  {@attach (shell) => {
    if (!assessment || !window.visualViewport) return;
    const viewport = window.visualViewport;
    let frame = 0;
    let visibleHeight = 0;
    const updateViewport = () => {
      const resized = visibleHeight !== viewport.height;
      visibleHeight = viewport.height;
      shell.style.setProperty('--session-height', `${viewport.height}px`);
      shell.style.setProperty('--session-top', `${Math.max(0, viewport.offsetTop)}px`);
      shell.style.setProperty(
        '--session-stage-space',
        viewport.height < 600 ? 'var(--space-6)' : 'calc(var(--space-8) * 3 + var(--space-2))'
      );
      if (resized) {
        const active = document.activeElement;
        if (active instanceof HTMLInputElement && shell.contains(active))
          active
            .closest('.answer-input-container')
            ?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
      }
    };
    const keepVisible = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(updateViewport);
    };
    keepVisible();
    viewport.addEventListener('resize', keepVisible);
    viewport.addEventListener('scroll', keepVisible);
    window.addEventListener('resize', keepVisible);
    window.addEventListener('scroll', keepVisible);
    return () => {
      cancelAnimationFrame(frame);
      viewport.removeEventListener('resize', keepVisible);
      viewport.removeEventListener('scroll', keepVisible);
      window.removeEventListener('resize', keepVisible);
      window.removeEventListener('scroll', keepVisible);
    };
  }}
>
  <header class="session-header" class:with-actions={!complete && onSaveLeave}>
    {#if !assessment}<button
        type="button"
        class="btn-icon"
        aria-label={exitLabel}
        title={exitLabel}
        disabled={busy}
        bind:this={exitButton}
        onclick={handleExitClick}
      >
        <ArrowLeft size={18} />
      </button>{/if}

    <div class="session-progress-container">
      <SessionProgress
        {phaseLabel}
        current={Math.min(currentPromptIndex + 1, totalPrompts)}
        total={totalPrompts}
      />
    </div>

    {#if onSaveLeave && !complete}<button
        type="button"
        class="btn-ghost"
        disabled={busy}
        bind:this={saveButton}
        onclick={() => {
          if (saveWouldInvalidateCheck) confirmCheckSave = true;
          else onSaveLeave();
        }}>{m.session_save_leave()}</button
      >{/if}
    {#if canPause}
      <button
        type="button"
        class="btn-icon"
        aria-label={pauseLabel}
        title={pauseLabel}
        onclick={onPauseToggle}
      >
        {#if isPaused}
          <Play size={18} />
        {:else}
          <Pause size={18} />
        {/if}
      </button>
    {:else if !assessment}
      <div class="header-spacer"></div>
    {/if}
  </header>

  <div class="session-stage">
    <div class="session-content">
      {#if children}
        {@render children()}
      {/if}
      {#if assessment && isPaused}
        {#if pauseDetails}{@render pauseDetails()}{/if}
        <button type="button" class="btn-ghost" disabled={busy} onclick={handleExitClick}
          >{m.mixed_exit()}</button
        >
        <p>{m.check_end_hint()}</p>
      {/if}
    </div>
  </div>

  {#if assessment && onSaveLeave && !complete}
    <ExitSessionDialog
      isOpen={confirmCheckSave}
      title={m.check_save_title()}
      description={m.check_save_warning()}
      confirmLabel={m.session_save_leave()}
      cancelLabel={m.check_keep_checking()}
      onConfirm={() => {
        confirmCheckSave = false;
        onSaveLeave?.();
      }}
      onCancel={() => (confirmCheckSave = false)}
      returnFocusTo={saveButton}
    />
  {/if}
  <ExitSessionDialog
    isOpen={showExitConfirm}
    title={assessment ? m.check_end_title() : review ? m.review_leave_title() : undefined}
    description={assessment
      ? saveWouldInvalidateCheck
        ? m.check_end_checkpoint_warning()
        : m.check_end_description()
      : review
        ? m.review_leave_description()
        : undefined}
    onSaveLeave={onSaveLeave
      ? () => {
          showExitConfirm = false;
          onSaveLeave?.();
        }
      : undefined}
    cancelLabel={assessment ? m.check_keep_checking() : undefined}
    confirmLabel={assessment ? m.mixed_exit() : review ? m.review_exit() : undefined}
    onConfirm={handleConfirmExit}
    onCancel={handleCancelExit}
    {returnFocusTo}
    fallbackFocus={exitButton}
  />
</div>

<style>
  .session-shell.assessment {
    container-type: size;
    position: fixed;
    inset-inline: 0;
    top: 0;
    transform: translateY(var(--session-top, 0px));
    height: var(--session-height, 100dvh);
    min-height: 0;
    overflow-y: auto;
  }
  .assessment .session-stage {
    min-height: 0;
    overflow-y: auto;
  }
  .assessment .session-header {
    border-bottom: 0;
  }
  .assessment .session-progress-container {
    margin: 0 auto 0 0;
    justify-content: flex-start;
    max-width: 5rem;
    min-width: 4rem;
  }
  .assessment .session-content {
    gap: var(--space-8);
    margin: 0;
  }
  .assessment .session-stage {
    align-items: flex-start;
    padding: min(var(--session-stage-space, calc(var(--space-8) * 3 + var(--space-2))), 104px)
      var(--space-6) var(--space-6);
  }
  .assessment .session-header {
    padding: var(--space-5) max(var(--space-6), env(safe-area-inset-right, 0px)) var(--space-5)
      max(var(--space-6), env(safe-area-inset-left, 0px));
  }
  .assessment .session-header .btn-ghost {
    white-space: normal;
    overflow-wrap: anywhere;
  }
  .assessment .session-header button {
    color: var(--accent);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    font-size: var(--text-base);
    font-weight: 600;
  }
  .assessment .session-header :global(.progress-readout) {
    font-family: inherit;
    font-weight: 600;
    color: var(--text-primary);
  }
  @media (min-width: 768px) {
    .assessment .session-header {
      padding-inline: max(calc(var(--space-6) * 2), env(safe-area-inset-left, 0px))
        max(calc(var(--space-6) * 2), env(safe-area-inset-right, 0px));
    }
    .assessment .session-progress-container {
      max-width: 10rem;
    }
  }
  @media (max-height: 600px) {
    .assessment .session-stage {
      padding-top: var(--space-6);
    }
  }
  .assessment .session-header :global(.session-progress) {
    flex-direction: column-reverse;
    align-items: stretch;
    width: 100%;
    min-width: 4rem;
    gap: var(--space-2);
  }
  .assessment .session-header :global(.progress-bar-track) {
    flex: none;
  }
  .assessment .session-header :global(.progress-readout) {
    font-size: var(--text-base);
    text-align: left;
  }
  /* A short visual viewport must be able to scroll the header away with the prompt. */
  @container (height < 14rem) {
    .assessment .session-header {
      position: static;
      flex-shrink: 0;
    }
    .assessment .session-stage {
      flex: 1 0 auto;
      overflow: visible;
    }
  }
  .session-shell {
    container-type: inline-size;
    display: flex;
    flex-direction: column;
    min-height: 100vh;
    min-height: 100dvh;
    background-color: var(--bg-base);
    color: var(--text-primary);
    overflow-x: hidden;
  }

  .session-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    padding-top: calc(var(--space-3) + env(safe-area-inset-top, 0px));
    padding-right: calc(var(--space-4) + env(safe-area-inset-right, 0px));
    padding-bottom: var(--space-3);
    padding-left: calc(var(--space-4) + env(safe-area-inset-left, 0px));
    border-bottom: 1px solid var(--border);
    background-color: var(--bg-surface);
    position: sticky;
    top: 0;
    z-index: 50;
  }

  .session-progress-container {
    flex: 1;
    display: flex;
    justify-content: center;
    max-width: 14rem;
    margin: 0 var(--space-3);
  }

  .header-spacer {
    width: var(--answer-target-min);
  }

  .session-header button {
    min-width: var(--answer-target-min);
    min-height: var(--answer-target-min);
  }

  .session-stage {
    flex: 1;
    display: flex;
    justify-content: center;
    align-items: center;
    padding-top: var(--space-4);
    padding-right: calc(var(--space-4) + env(safe-area-inset-right, 0px));
    padding-bottom: calc(var(--space-4) + env(safe-area-inset-bottom, 0px));
    padding-left: calc(var(--space-4) + env(safe-area-inset-left, 0px));
  }

  .session-content {
    width: 100%;
    max-width: var(--session-max-width, 42rem);
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    margin: auto 0;
  }

  .session-stage:has(:global(.phone-response)) {
    align-items: stretch;
    padding-block: clamp(1lh, calc((var(--session-height, 100svh) - 540px) / 2), 160px)
      max(8px, env(safe-area-inset-bottom, 0px));
  }
  .session-content:has(:global(.phone-response)) {
    margin-block: 0;
    gap: 0;
  }

  .session-shell--complete .session-stage {
    align-items: flex-start;
    padding-top: var(--space-8);
  }
  .session-shell--complete .session-content {
    margin: 0;
  }

  @media (max-width: 480px) {
    .session-header {
      padding-top: calc(var(--space-2) + env(safe-area-inset-top, 0px));
      padding-right: calc(var(--space-3) + env(safe-area-inset-right, 0px));
      padding-bottom: var(--space-2);
      padding-left: calc(var(--space-3) + env(safe-area-inset-left, 0px));
    }
  }

  @container (width < 18rem) {
    .session-header:not(.with-actions) {
      display: grid;
      grid-template-columns: 1fr 1fr;
    }
    .assessment .session-header:not(.with-actions) {
      display: flex;
    }
    .session-header button {
      justify-self: start;
    }
    .session-header button:last-child,
    .header-spacer {
      justify-self: end;
    }
    .session-progress-container {
      grid-row: 2;
      grid-column: 1 / -1;
      max-width: none;
      margin: 0;
    }
  }

  @container (width < 30rem) {
    :where(.session-shell:not(.assessment)) .with-actions {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
    }
    .with-actions .btn-ghost {
      white-space: normal;
      margin-inline-start: auto;
      max-width: 100%;
      overflow-wrap: anywhere;
    }
    :where(.session-shell:not(.assessment)) .with-actions .session-progress-container {
      display: block;
      order: 1;
      grid-column: 1 / -1;
      grid-row: 2;
      max-width: none;
      margin: 0;
    }
  }

  /* Keep the icon targets at touch size when enlarged text needs the middle column. */
  @container (width < 18rem) {
    .assessment .session-stage {
      padding: min(var(--session-stage-space, var(--space-6)), 24px)
        max(16px, env(safe-area-inset-right, 0px)) max(16px, env(safe-area-inset-bottom, 0px))
        max(16px, env(safe-area-inset-left, 0px));
    }
    .session-header.with-actions {
      grid-template-columns: 48px minmax(0, 1fr) 48px;
      column-gap: 8px;
      padding-inline: max(8px, env(safe-area-inset-left, 0px))
        max(8px, env(safe-area-inset-right, 0px));
    }
    .assessment .with-actions {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 48px;
      padding-block: max(8px, env(safe-area-inset-top, 0px)) 8px;
    }
    .assessment .with-actions .session-progress-container {
      max-width: none;
      margin: 0;
    }
    .assessment .with-actions :global(.session-progress) {
      flex-direction: row;
      align-items: center;
    }
    .assessment .with-actions :global(.progress-bar-track) {
      flex: 1;
    }
    .with-actions .btn-icon,
    .with-actions .header-spacer {
      width: 48px;
      min-width: 48px;
      min-height: 48px;
      height: 48px;
      padding: 0;
    }
    .with-actions .btn-ghost {
      justify-self: center;
      margin-inline: 0;
      min-width: 0;
      min-height: 48px;
      padding: var(--space-1) 8px;
    }
  }
</style>
