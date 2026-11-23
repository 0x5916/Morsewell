<script lang="ts">
  import { CircleAlert, Play, RotateCcw, Volume2 } from '@lucide/svelte';
  import type { GuidedSessionPhase } from '../../training/v2/guided-session';
  import * as m from '#lib/paraglide/messages.js';

  interface Props {
    phase: GuidedSessionPhase;
    character: string;
    showHint: boolean;
    hasPlayed: boolean;
    audioError: string | null;
    onPlay: () => void;
    onContinue: () => void;
  }

  let { phase, character, showHint, hasPlayed, audioError, onPlay, onContinue }: Props = $props();
  let isPlaying = $derived(phase === 'playing');
  let canPlay = $derived(phase === 'introducing' || phase === 'ready');
  let canContinue = $derived(phase === 'introducing' && hasPlayed);

  function activate() {
    if (canContinue) onContinue();
    else if (canPlay) onPlay();
  }
</script>

<section class="introduction">
  <h1 class="character" aria-label={m.lesson_meet_character({ character })}>{character}</h1>
  {#if showHint}<p class="instruction">{m.lesson_intro_hint()}</p>{/if}

  <div class="actions">
    <p class="sr-only" role="status">{hasPlayed && !isPlaying ? m.lesson_intro_heard() : ''}</p>
    {#if isPlaying}
      <p class="playback-status"><Volume2 size={18} aria-hidden="true" />{m.lesson_listening()}</p>
    {/if}
    {#if audioError}
      <p class="audio-error" role="alert">
        <CircleAlert size={18} aria-hidden="true" />
        {m.lesson_feedback_audio_error()}
      </p>
    {/if}
    {#if hasPlayed}
      <button
        type="button"
        class="btn-ghost replay"
        disabled={!canPlay}
        aria-keyshortcuts={canContinue ? 'Space' : undefined}
        onclick={onPlay}
      >
        <RotateCcw size={20} aria-hidden="true" />
        {m.lesson_hear_character({ character })}
      </button>
    {/if}
    <button
      type="button"
      class="btn-primary"
      aria-disabled={!canPlay}
      aria-busy={isPlaying}
      aria-keyshortcuts={canPlay ? (canContinue ? 'Enter' : 'Space') : undefined}
      onclick={activate}
    >
      {#if isPlaying || canContinue}
        {m.lesson_continue()}
      {:else}
        <Play size={20} aria-hidden="true" /> {m.lesson_listen_character({ character })}
      {/if}
    </button>
  </div>
</section>

<style>
  .introduction {
    width: 100%;
    max-width: 30rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-6);
    padding-block: var(--space-6);
  }
  h1 {
    margin: 0;
    font-size: var(--text-2xl);
    font-weight: 600;
  }
  .character {
    font-family: var(--font-mono);
    font-size: clamp(5rem, 18vw, 7rem);
    font-weight: 600;
    line-height: 1.2;
  }
  .instruction {
    margin: 0;
    max-width: 26ch;
    color: var(--text-secondary);
    font-size: var(--text-base);
    line-height: var(--leading-normal);
  }
  .actions {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    width: 100%;
    margin-top: var(--space-3);
  }
  .playback-status,
  .audio-error {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    margin: 0 0 var(--space-2);
    font-size: var(--text-sm);
    color: var(--text-muted);
  }
  .audio-error {
    color: var(--status-bad);
  }
  button {
    min-height: 3.5rem;
    padding: var(--space-3) var(--space-4);
    font-size: var(--text-base);
    gap: var(--space-2);
  }
  .replay {
    border: 1px solid var(--border-control);
  }
  .btn-primary[aria-disabled='true'] {
    background: var(--bg-inset);
    color: var(--text-muted);
    cursor: wait;
  }
  @container (width < 18rem) {
    .introduction {
      gap: var(--space-3);
    }
    .character {
      font-size: 3rem;
    }
    .actions {
      margin-top: 0;
    }
  }
</style>
