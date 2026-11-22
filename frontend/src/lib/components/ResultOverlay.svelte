<script lang="ts">
  import { X, Check, CircleAlert } from '@lucide/svelte';
  import { dialogFocusables, dialogFocusTarget } from './dialog-focus';
  import { scoreGrade, type PassageComparison } from '#lib/score.ts';
  import { passageCorrections } from './practice/passage-corrections';
  import { formatPercent } from '#lib/format.ts';
  import * as m from '#lib/paraglide/messages.js';

  interface Props {
    result: number;
    comparison: PassageComparison;
    /** Lesson the result belongs to (shown in the panel header area). */
    lessonNum: number;
    contentLabel?: string;
    /** The passage that was sent — the reference for the diff and the copy. */
    sourceText: string;
    onClose: () => void;
    onRegenerate: () => void;
    onFinish: () => void;
    fallbackFocus: HTMLElement | null;
    persistenceStatus?: 'saving' | 'saved' | 'failed' | null;
    onRetrySave?: () => void;
  }

  let {
    result,
    comparison,
    lessonNum,
    contentLabel,
    sourceText,
    onClose,
    onRegenerate,
    onFinish,
    fallbackFocus,
    persistenceStatus = null,
    onRetrySave
  }: Props = $props();

  let grade = $derived(scoreGrade(result));
  let pct = $derived(formatPercent(result));
  let savePending = $derived(persistenceStatus === 'saving' || persistenceStatus === 'failed');

  const corrections = $derived(passageCorrections(comparison.groups));
  const titleId = $props.id();
  // A saved draft may end halfway through an emoji at the editor's UTF-16 length limit.
  const symbolLabel = (text: string) =>
    text === ' '
      ? m.practice_diff_space()
      : text.replace(/\p{Surrogate}/gu, () => m.practice_diff_incomplete_symbol());

  /**
   * Keep Tab inside the panel and close on Escape, returning focus to whatever
   * opened it. Native Space/Enter activation stays on the focused control.
   */
  function onPanelKeydown(event: KeyboardEvent & { currentTarget: HTMLDialogElement }) {
    event.stopPropagation();
    if (
      event.key === 'Escape' &&
      (event.repeat ||
        event.isComposing ||
        event.keyCode === 229 ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey)
    ) {
      event.preventDefault();
    }
    if (event.key !== 'Tab' || event.defaultPrevented || event.isComposing || event.keyCode === 229)
      return;
    const dialog = event.currentTarget;
    const target = dialogFocusTarget(
      dialogFocusables(dialog),
      document.activeElement as HTMLElement | null,
      event.shiftKey,
      dialog
    );
    if (target) {
      event.preventDefault();
      target.focus();
    }
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) onClose();
  }

  function openModal(modal: HTMLDialogElement) {
    const opener = document.activeElement;
    modal.showModal();
    modal.focus();
    return () => {
      modal.close();
      const target =
        opener instanceof HTMLElement && opener !== document.body && opener.isConnected
          ? opener
          : fallbackFocus;
      target?.focus({ preventScroll: true });
    };
  }
</script>

<dialog
  class="overlay-backdrop"
  {@attach openModal}
  aria-labelledby={titleId}
  onclick={handleBackdropClick}
  onkeydown={onPanelKeydown}
  oncancel={(event) => {
    event.preventDefault();
    onClose();
  }}
>
  <div class="overlay-panel">
    <header class="overlay-head">
      <h2 id={titleId} class="overlay-title">{m.trainer_result_title()}</h2>
      <button
        class="overlay-close btn-icon"
        type="button"
        onclick={onClose}
        aria-label={m.overlay_close()}
      >
        <X size={16} />
      </button>
    </header>

    {#if persistenceStatus === 'failed'}
      <div
        class="save-status save-failure"
        role="alert"
        {@attach (notice) => {
          notice.closest('.overlay-panel')?.scrollTo({ top: 0 });
        }}
      >
        <p><CircleAlert size={16} aria-hidden="true" />{m.practice_history_failed()}</p>
        <button type="button" class="btn-primary" onclick={onRetrySave}
          >{m.lesson_retry_save()}</button
        >
      </div>
    {/if}

    <div class="overlay-score overlay-{grade}">
      <p class="overlay-pct">{pct}</p>
      <div class="overlay-score-body">
        <p class="overlay-grade">{m.practice_passage_accuracy()}</p>
        <p class="overlay-rule">
          {contentLabel ?? m.practice_history_groups({ step: lessonNum })}
        </p>
      </div>
    </div>

    <section class="overlay-diff-section">
      <h3 class="diff-count">
        {comparison.differences === 0
          ? m.practice_diff_match()
          : comparison.usesUnicodeUnits
            ? m.practice_diff_scored_count({ count: comparison.differences })
            : comparison.differences === 1
              ? m.practice_diff_one()
              : m.practice_diff_count({ count: comparison.differences })}
      </h3>
      {#if corrections.length}
        <table class="corrections">
          <thead
            ><tr
              ><th scope="col">{m.practice_diff_sent()}</th><th scope="col"
                >{m.practice_diff_copied()}</th
              ></tr
            ></thead
          >
          <tbody>
            {#each corrections as row, index (index)}
              {#if row.kind === 'omission'}
                <tr
                  ><td colspan="2">
                    <details>
                      <summary>{m.practice_diff_omitted_run({ count: row.count })}</summary>
                      <div class="omitted-groups">
                        {#each row.groups as group, groupIndex (groupIndex)}
                          <span
                            >{#each group as token, i (i)}<span
                                class:word-space={token.ref === ' '}
                                role="img"
                                aria-label={m.practice_diff_missing({
                                  text: symbolLabel(token.ref)
                                })}>{symbolLabel(token.ref)}</span
                              >{/each}</span
                          >
                        {/each}
                      </div>
                    </details>
                  </td></tr
                >
              {:else}
                <tr class="diff-group">
                  <td
                    >{#each row.tokens as token, i (i)}<span
                        class:changed={token.type !== 'correct'}
                        class:word-space={token.ref === ' '}>{symbolLabel(token.ref) || '·'}</span
                      >{/each}</td
                  >
                  <td
                    >{#each row.tokens as token, i (i)}
                      {@const sent = symbolLabel(token.ref)}
                      {@const copied = symbolLabel(token.inp)}
                      {#if token.type === 'correct'}{copied}{:else}<span
                          class="changed"
                          class:word-space={token.inp === ' '}
                          role="img"
                          aria-label={token.type === 'missing'
                            ? m.practice_diff_missing({ text: sent })
                            : token.type === 'extra'
                              ? m.practice_diff_extra({ text: copied })
                              : m.practice_diff_substitution({ entered: copied, expected: sent })}
                          >{copied || '·'}</span
                        >{/if}
                    {/each}</td
                  >
                </tr>
              {/if}
            {/each}
          </tbody>
        </table>
      {/if}
    </section>
    <details class="overlay-source">
      <summary>{m.trainer_source_label()}</summary>
      <p class="quote-text">{symbolLabel(sourceText)}</p>
    </details>
    <details class="overlay-source">
      <summary>{m.practice_score_method()}</summary>
      <p class="overlay-rule">
        {comparison.usesUnicodeUnits
          ? m.practice_score_unicode_explanation()
          : m.practice_score_explanation()}
      </p>
    </details>

    {#if persistenceStatus && persistenceStatus !== 'failed'}
      <div class="save-status" role="status">
        {#if persistenceStatus === 'saved'}
          <Check size={16} aria-hidden="true" />
          <p>{m.practice_history_saved()}</p>
        {:else}
          <p>{m.practice_history_saving()}</p>
        {/if}
      </div>
    {/if}

    <footer class="overlay-actions">
      <button
        type="button"
        class={savePending ? 'btn-ghost' : 'btn-primary'}
        onclick={onRegenerate}
        disabled={savePending}>{m.trainer_try_again()}</button
      >
      <button
        type="button"
        class="btn-ghost"
        onclick={onFinish}
        disabled={persistenceStatus === 'saving'}
        >{persistenceStatus === 'failed'
          ? m.lesson_leave_unsaved()
          : m.lesson_result_finish()}</button
      >
    </footer>
  </div>
</dialog>

<style>
  .overlay-panel summary {
    cursor: pointer;
    min-height: var(--answer-target-min);
    padding-block: var(--space-3);
    font-size: var(--text-sm);
  }
  /* A compact panel, not a takeover: the practice surface stays visible around
     it and the scrim is flat (no blur, no glow). */
  .overlay-backdrop::backdrop {
    background: color-mix(in srgb, var(--bg-base) 70%, transparent);
  }

  .overlay-backdrop {
    position: fixed;
    inset: 0;
    width: 100%;
    height: 100%;
    max-width: none;
    max-height: none;
    margin: 0;
    padding: min(var(--space-4), 3vw);
    border: 0;
    color: inherit;
    background: transparent;
  }

  .overlay-backdrop[open] {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .overlay-panel {
    container-type: inline-size;
    background: var(--bg-surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    width: 100%;
    max-width: 32rem;
    max-height: 85vh;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    overflow-wrap: anywhere;
    box-shadow: var(--shadow-overlay);
  }

  .overlay-backdrop:focus {
    outline: none;
  }

  .overlay-head {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-3) var(--space-3) var(--space-5);
    border-bottom: 1px solid var(--border);
  }

  .overlay-title {
    min-width: 0;
    margin: 0;
    font-size: var(--text-lg);
    line-height: var(--leading-snug);
    font-weight: 600;
    color: var(--text-primary);
  }

  /* Score strip: a readout, not a hero. */
  .overlay-score {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: var(--space-4);
    padding: var(--space-4) var(--space-5);
  }

  .overlay-good {
    background: var(--result-good-bg);
  }

  .overlay-ok {
    background: var(--status-ok-tint);
  }

  .overlay-bad {
    background: var(--result-bad-bg);
  }

  .overlay-pct {
    margin: 0;
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
    font-size: var(--text-2xl);
    font-weight: 500;
    line-height: 1;
  }

  .overlay-good .overlay-pct {
    color: var(--status-good);
  }

  .overlay-ok .overlay-pct {
    color: var(--status-ok);
  }

  .overlay-bad .overlay-pct {
    color: var(--status-bad);
  }

  .overlay-score-body {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    min-width: 0;
  }

  .overlay-grade {
    margin: 0;
    font-size: var(--text-base);
    font-weight: 600;
    color: var(--text-primary);
  }

  .overlay-rule {
    margin: 0;
    font-size: var(--text-xs);
    color: var(--text-secondary);
  }

  .overlay-source {
    padding-inline: var(--space-5);
    border-top: 1px solid var(--border);
  }
  .overlay-source > p {
    margin: 0 0 var(--space-4);
    overflow-wrap: anywhere;
  }
  .save-status {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-5);
    border-top: 1px solid var(--border);
  }
  .save-status p {
    margin: 0;
  }
  .save-failure {
    flex-direction: column;
    align-items: flex-start;
    border-top: 0;
    border-bottom: 1px solid var(--border);
    background: var(--result-bad-bg);
    padding-inline: min(var(--space-5), 6%);
  }
  .save-failure p {
    color: var(--text-primary);
  }
  .save-failure :global(svg) {
    color: var(--status-bad);
    margin-inline-end: var(--space-2);
  }
  .save-failure button {
    max-width: 100%;
    white-space: normal;
    overflow-wrap: anywhere;
  }
  .overlay-diff-section {
    padding: var(--space-4) var(--space-5);
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .diff-count {
    margin: 0;
    font-size: var(--text-base);
    font-weight: 600;
  }

  .corrections {
    border-collapse: collapse;
    table-layout: fixed;
    width: 100%;
  }
  .corrections th,
  .corrections td {
    width: 50%;
    text-align: start;
    vertical-align: top;
    padding-block: var(--space-2);
    border-bottom: 1px solid var(--border);
  }
  .corrections th {
    font-size: var(--text-sm);
    color: var(--text-secondary);
    font-weight: 500;
  }
  .corrections td {
    font-family: var(--font-mono);
    overflow-wrap: anywhere;
  }
  .corrections td:first-child:not([colspan]) {
    padding-inline-end: var(--space-3);
  }
  .corrections summary {
    font-family: var(--font-ui);
  }
  .changed {
    color: var(--text-primary);
    background: var(--status-ok-tint);
    text-decoration: underline;
    font-weight: 700;
  }
  .word-space {
    font: var(--text-xs) var(--font-ui);
    padding-inline: var(--space-1);
  }
  .omitted-groups {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    padding-block: var(--space-2);
  }
  .omitted-groups > span {
    max-width: 100%;
  }

  .overlay-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-5) var(--space-5);
    border-top: 1px solid var(--border);
  }

  .overlay-actions button {
    min-width: var(--answer-target-min);
    min-height: var(--answer-target-min);
  }

  .overlay-actions button {
    white-space: normal;
  }

  .overlay-close {
    width: 48px;
    height: 48px;
    min-width: 48px;
    min-height: 48px;
  }

  @container (max-width: 20rem) {
    .overlay-score-body {
      display: contents;
    }
    .overlay-score-body .overlay-rule {
      grid-column: 1 / -1;
    }
    .overlay-head,
    .overlay-score,
    .overlay-diff-section {
      padding-inline: var(--space-3);
    }
  }

  @media (max-width: 640px) {
    .overlay-actions > * {
      flex: 1 1 auto;
    }
  }
</style>
