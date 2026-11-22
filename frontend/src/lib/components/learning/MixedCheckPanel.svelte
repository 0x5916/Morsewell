<script lang="ts">
  import LearningOverview from './LearningOverview.svelte';
  import { mixedCriteriaText, mixedGapText } from './recommendation-copy';
  import type { LearningSnapshot } from '../../data/learning-snapshot';
  import type { Snippet } from 'svelte';
  import type { MixedCheckSession } from '../../training/learning-policy/mixed-plan';
  import type { EvaluatedCheck } from '../../training/learning-policy/types';
  import * as m from '#lib/paraglide/messages.js';
  let {
    plan,
    result = null,
    finalStatus = null,
    loadFailed = false,
    onRetry,
    snapshot = null,
    busy = false,
    unlockedLesson = null,
    storageStatus,
    onRepeatCheck,
    onFinish
  }: {
    plan: MixedCheckSession;
    result?: EvaluatedCheck | null;
    finalStatus?: 'completed' | 'incomplete' | 'rejected' | null;
    loadFailed?: boolean;
    onRetry?: () => void;
    snapshot?: LearningSnapshot | null;
    busy?: boolean;
    unlockedLesson?: number | null;
    storageStatus?: Snippet;
    onRepeatCheck?: () => void;
    onFinish: () => void;
  } = $props();
  const outcome = $derived.by(() => {
    if (finalStatus === 'rejected' || finalStatus === 'incomplete') return finalStatus;
    if (finalStatus === 'completed' && result) return result.complete ? 'completed' : 'incomplete';
    return loadFailed ? 'unavailable' : 'pending';
  });
  const evaluated = $derived(outcome === 'completed' || outcome === 'incomplete');
</script>

<section class="mixed-panel">
  <h1 aria-live="polite" tabindex="-1" {@attach (heading) => heading.focus()}>
    {#if outcome === 'completed'}{m.mixed_results()}
    {:else if outcome === 'incomplete'}{m.check_prompts_finished({ count: plan.prompts.length })}
    {:else if outcome === 'rejected'}{m.history_evidence_rejected()}
    {:else if outcome === 'unavailable'}{m.mixed_result_unavailable()}
    {:else}{m.mixed_evaluating()}{/if}
  </h1>
  {#if outcome === 'incomplete'}<p role="status">{m.mixed_invalid()}</p>{/if}
  {#if evaluated && result}
    <div class="scores">
      <h2>{m.review_first_listen()}</h2>
      <dl>
        {#each plan.plan.targets as character (character)}
          <div>
            <dt>{character}</dt>
            <dd>
              {m.check_result_fraction({
                correct: result.targets[character]?.unassistedCorrect ?? 0,
                total: result.targets[character]?.eligible ?? 0
              })}
            </dd>
          </div>
        {/each}
      </dl>
    </div>
  {/if}
  {#if outcome === 'unavailable' && onRetry}<button
      class="btn-ghost"
      type="button"
      onclick={onRetry}>{m.common_retry()}</button
    >{/if}
  {#if storageStatus}{@render storageStatus()}{/if}
  {#if evaluated}<details class="ui-disclosure">
      <summary>{m.check_milestone_rules()}</summary>
      <p>{m.check_result_speed({ speed: plan.plan.profile.charWpm })}</p>
      <p>{mixedCriteriaText()}</p>
      <p>{mixedGapText()}</p>
    </details>{/if}
  {#if evaluated && snapshot && !busy}<LearningOverview
      {snapshot}
      {unlockedLesson}
      compact
      onAction={onRepeatCheck}
    />{/if}
  <button
    class={snapshot ? 'btn-ghost' : 'btn-primary'}
    type="button"
    disabled={busy}
    onclick={onFinish}>{m.lesson_result_finish()}</button
  >
</section>

<style>
  .mixed-panel {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-6);
    width: 100%;
    max-width: 34rem;
    text-align: left;
  }
  h1 {
    font-size: var(--text-2xl);
    margin: 0;
  }
  h1:focus {
    outline: none;
  }
  p {
    margin: 0;
    color: var(--text-secondary);
    line-height: var(--leading-normal);
  }
  .scores h2 {
    font-size: var(--text-lg);
    margin: 0;
  }
  dl {
    display: grid;
    gap: var(--space-2);
    margin: var(--space-2) 0 0;
  }
  dl > div {
    display: flex;
    gap: var(--space-4);
    align-items: baseline;
  }
  dt {
    font-weight: 600;
    font-family: var(--font-mono);
  }
  dd {
    margin: 0;
    font-variant-numeric: tabular-nums;
  }
  button {
    min-height: 3rem;
  }
</style>
