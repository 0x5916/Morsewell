<script lang="ts">
  import type { SessionCheckpoint } from '../../data/session-checkpoints';
  import { localizedHref } from '#lib/i18n.svelte.ts';
  import { LESSONS } from '../../training/sequence';
  import { savedSessionAction } from './recommendation-copy';
  import { formatDateTime } from '#lib/format.ts';
  import ExitSessionDialog from './ExitSessionDialog.svelte';
  import * as m from '#lib/paraglide/messages.js';
  let {
    entries,
    onDiscard,
    onContinue,
    busy = false
  }: {
    entries: SessionCheckpoint[];
    onDiscard: (entry: SessionCheckpoint) => void;
    onContinue?: (entry: SessionCheckpoint) => void;
    busy?: boolean;
  } = $props();
  const id = $props.id();
  let discardTarget = $state.raw<SessionCheckpoint | null>(null);
  let trigger = $state<HTMLElement | null>(null);

  function sessionTitle(entry: SessionCheckpoint) {
    if (entry.kind === 'copy') return m.practice_passage();
    if (entry.mixed) {
      const targets = entry.mixed.plan?.targets;
      return Array.isArray(targets)
        ? m.mixed_targets({ characters: targets.join(', ') })
        : m.mixed_title();
    }
    if (entry.review) {
      if (entry.review.purpose === 'return-screening') return m.review_return_title();
      return Array.isArray(entry.review.targets)
        ? m.review_title({ characters: entry.review.targets.join(', ') })
        : m.session_resume_coaching();
    }
    const step = entry.record.step;
    return m.home_lesson_title({ step, characters: LESSONS[step - 1]?.split('').join(', ') ?? '' });
  }

  function confirmDiscard() {
    const entry = discardTarget;
    discardTarget = null;
    if (entry && entries.includes(entry) && !busy) onDiscard(entry);
  }
</script>

{#if entries.length}
  <section class="saved-sessions">
    {#each entries as entry, index (entry.id)}
      {@const action = savedSessionAction(entry)}
      {@const titleId = `${id}-title-${index}`}
      {@const timeId = `${id}-time-${index}`}
      {@const description = entries.length > 1 ? `${titleId} ${timeId}` : titleId}
      <article aria-labelledby={titleId}>
        <h2 id={titleId}>{sessionTitle(entry)}</h2>
        <p>
          {entry.kind === 'copy'
            ? m.practice_resume_hint()
            : m.saved_prompt_position({
                current: entry.state.currentPromptIndex + 1,
                total: entry.state.prompts.length
              })}
        </p>
        {#if entries.length > 1}<time id={timeId} datetime={entry.savedAt}
            >{formatDateTime(entry.savedAt)}</time
          >{/if}
        <div>
          {#if onContinue}
            <button
              class={index === 0 ? 'btn-primary' : 'btn-ghost'}
              disabled={busy}
              aria-describedby={description}
              onclick={() => onContinue?.(entry)}>{action.title}</button
            >
          {:else}
            <a
              class={index === 0 ? 'btn-primary' : 'btn-ghost'}
              href={localizedHref(action.path)}
              aria-describedby={description}>{action.title}</a
            >
          {/if}
          <button
            class="btn-ghost"
            aria-describedby={description}
            disabled={busy}
            onclick={(event) => {
              trigger = event.currentTarget;
              discardTarget = entry;
            }}>{m.session_discard()}</button
          >
        </div>
      </article>
    {/each}
  </section>
{/if}

<ExitSessionDialog
  isOpen={discardTarget !== null && entries.includes(discardTarget)}
  title={m.session_discard_title()}
  description={discardTarget?.kind === 'copy'
    ? m.practice_discard_saved_hint()
    : m.lesson_discard_saved_hint()}
  cancelLabel={m.session_keep_saved()}
  confirmLabel={m.session_discard()}
  returnFocusTo={trigger}
  onCancel={() => (discardTarget = null)}
  onConfirm={confirmDiscard}
/>

<style>
  .saved-sessions {
    display: grid;
    gap: var(--space-6);
  }
  article {
    display: grid;
    gap: var(--space-3);
  }
  h2,
  p {
    margin: 0;
  }
  h2 {
    font-size: var(--text-xl);
  }
  time {
    display: block;
    color: var(--text-secondary);
    font-size: var(--text-sm);
  }
  article > div {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }
  a,
  button {
    min-height: var(--answer-target-min);
  }
</style>
