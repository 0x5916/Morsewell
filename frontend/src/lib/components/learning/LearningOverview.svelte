<script lang="ts">
  import { prepareCheckLink } from '#lib/check-start-intent.ts';
  import { LEARNING_POLICY } from '#lib/training/learning-policy/policy.ts';
  import type { LearningCharacter, LearningSnapshot } from '../../data/learning-snapshot';
  import { learningRecommendationHref } from '../../data/learning-snapshot';
  import {
    recommendationTitle,
    recommendationHint,
    criterionLabel,
    mixedGapText,
    mixedCriteriaText
  } from './recommendation-copy';
  import { isRecommendationLessonLocked } from '#lib/training/v2/lesson-access.ts';
  import { localizedHref } from '#lib/i18n.svelte.ts';
  import { formatDateTime } from '#lib/format.ts';
  import type { Attainment } from '../../training/learning-policy/types';
  import * as m from '#lib/paraglide/messages.js';
  let {
    snapshot,
    characterRecords = [],
    details = false,
    compact = false,
    secondary = false,
    progressView = null,
    unlockedLesson = null,
    onAction
  }: {
    snapshot: LearningSnapshot;
    characterRecords?: LearningCharacter[];
    details?: boolean;
    compact?: boolean;
    secondary?: boolean;
    progressView?: string | null;
    /** Guided-course unlock boundary; learning evidence cannot exceed it. */
    unlockedLesson?: number | null;
    onAction?: () => void;
  } = $props();
  import { browser } from '$app/env';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { tick } from 'svelte';
  import { ChevronDown } from '@lucide/svelte';
  let scrollRegion = $state<HTMLDivElement>();
  let filterControl = $state<HTMLSelectElement>();
  const filter = $derived(
    browser &&
      progressView &&
      ['met', 'not-met', 'stale'].includes(page.url.searchParams.get('status') ?? '')
      ? page.url.searchParams.get('status')!
      : 'all'
  );
  async function changeFilter(value: string, focusFilter = false) {
    const url = new URL(page.url.href);
    url.searchParams.set('view', 'characters');
    url.searchParams.set('status', value);
    await goto(url, { reset: false });
    await tick();
    if (focusFilter) filterControl?.focus({ preventScroll: true });
    scrollRegion?.scrollTo({ top: 0 });
    if (filterControl && filterControl.getBoundingClientRect().top < 0)
      filterControl.scrollIntoView({ block: 'start' });
  }
  const primary = $derived(snapshot.recommendation.primary);
  const recommendationLocked = $derived(
    unlockedLesson !== null && isRecommendationLessonLocked(primary, unlockedLesson)
  );
  const nextHref = $derived(
    localizedHref(
      recommendationLocked
        ? '/morse/learn'
        : learningRecommendationHref(primary, snapshot.knownCharacters)
    )
  );
  const checkTargets = $derived(
    new URL(nextHref, 'https://local.invalid').searchParams.get('check')
  );
  const hasCompanions = $derived(
    checkTargets && snapshot.knownCharacters.some((c) => !checkTargets?.includes(c))
  );
  const promptCount = $derived(
    (checkTargets?.length ?? 0) * LEARNING_POLICY.opportunitiesPerTarget +
      (hasCompanions ? LEARNING_POLICY.anchorCount : 0)
  );
  function characterCheckLabel(character: LearningCharacter): string {
    if (character.current.criterion !== 'insufficient')
      return criterionLabel(character.current.criterion);
    if (snapshot.coverage === 'partial') return m.learning_check_sync();
    switch (character.current.freshness) {
      case 'stale':
        return m.learning_check_old({ days: LEARNING_POLICY.freshnessMs / 86_400_000 });
      case 'none':
        return m.learning_check_none();
      default:
        return m.learning_check_incomplete();
    }
  }
  const filtered = $derived(
    characterRecords.filter(
      (c) =>
        filter === 'all' ||
        (filter === 'stale'
          ? !['met', 'not-met'].includes(c.current.criterion)
          : c.current.criterion === filter)
    )
  );
  const award = (value: Attainment | null) =>
    !value
      ? m.learning_notyet()
      : value.status === 'verified'
        ? m.learning_awarded()
        : m.learning_provisional();
</script>

<section class="learning-overview" class:progress-evidence={details} class:secondary>
  {#if progressView !== 'characters' && progressView !== 'history'}<div class="recommendation">
      {#if !compact}<header>
          <h2>
            {checkTargets
              ? (secondary ? m.optional_check_targets : m.mixed_targets)({
                  characters: checkTargets.split('').join(', ')
                })
              : m.learning_overview_heading()}
          </h2>
          <p>
            {checkTargets
              ? m.check_entry_facts({ count: promptCount, speed: snapshot.profile.charWpm })
              : recommendationHint(primary, snapshot.profile.charWpm)}
          </p>
          {#if checkTargets}<p>{m.check_first_credit()}</p>{/if}
        </header>{:else if checkTargets}<div>
          <p>{m.check_entry_facts({ count: promptCount, speed: snapshot.profile.charWpm })}</p>
          <p>{m.check_first_credit()}</p>
        </div>{/if}
      {#if recommendationLocked}
        <p role="status">
          {m.learning_next_locked({ step: primary.lesson ?? 1 })}
        </p>
        <a class={secondary ? 'btn-ghost' : 'btn-primary'} href={localizedHref('/morse/learn')}
          >{m.progress_return_course()}</a
        >
      {:else if onAction}<button
          type="button"
          class={secondary ? 'btn-ghost' : 'btn-primary'}
          onclick={onAction}
          >{checkTargets ? m.check_begin_explicit() : recommendationTitle(primary)}</button
        >
      {:else}
        <a
          class={secondary ? 'btn-ghost' : 'btn-primary'}
          href={nextHref}
          onclick={prepareCheckLink}
          >{checkTargets ? m.check_begin_explicit() : recommendationTitle(primary)}</a
        >
      {/if}
    </div>
    {#if checkTargets && !compact}<details class="ui-disclosure">
        <summary>{m.check_how()}</summary>
        <p>{m.mixed_setup({ count: promptCount })}</p>
        {#if hasCompanions}<p>
            {m.check_extra_prompts({ count: LEARNING_POLICY.anchorCount })}
          </p>{/if}
        <p>{m.mixed_support_hint()}</p>
        <p>{mixedGapText()}</p>
      </details>{/if}
  {/if}
  {#if !compact && !progressView && snapshot.coverage === 'partial'}<p role="status">
      {m.learning_coverage_partial()}
    </p>
  {:else if !compact && !progressView && snapshot.coverage === 'local-only'}<p class="supporting">
      {m.learning_coverage_local()}
    </p>{/if}
  {#if details}
    <div class="character-content" hidden={progressView !== null && progressView !== 'characters'}>
      <details class="ui-disclosure">
        <summary>{m.check_how()}</summary>
        <p>
          {m.check_current_rule({
            speed: snapshot.profile.charWpm,
            days: LEARNING_POLICY.freshnessMs / 86_400_000,
            correct: LEARNING_POLICY.successesPerCheck,
            total: LEARNING_POLICY.opportunitiesPerTarget
          })}
        </p>
        <p>{m.mixed_support_hint()}</p>
        <p>{mixedCriteriaText()}</p>
        <p>{mixedGapText()}</p>
        <p>{m.learning_review_gap({ hours: LEARNING_POLICY.coldGapMs / 3_600_000 })}</p>
      </details>
      <h2>{m.progress_character_records()}</h2>
      <p class="record-count" aria-live="polite">
        {m.progress_record_count({ count: filtered.length })}
      </p>
      {#if snapshot.confusions.length}
        <section>
          <h3>{m.progress_confusions()}</h3>
          {#each snapshot.confusions as finding (`${finding.expected}-${finding.actual}`)}
            <p>
              {m.learning_confusion({
                expected: finding.expected,
                actual: finding.actual,
                count: finding.confusionCount,
                total: finding.opportunityCount
              })}
            </p>
            {#if [finding.expected, finding.actual].every( (ch) => snapshot.knownCharacters.includes(ch) )}<a
                class="link"
                href={localizedHref(
                  `/morse/learn/session?review=${finding.expected}${finding.actual}`
                )}>{m.review_title({ characters: `${finding.expected}, ${finding.actual}` })}</a
              >{/if}
          {/each}
        </section>
      {/if}
      <label class="character-filter">
        <span class="sr-only">{m.progress_character_filter()}</span>
        <select
          class="select"
          bind:this={filterControl}
          bind:value={() => filter, (value) => void changeFilter(value)}
        >
          <option value="all">{m.history_all()}</option>
          <option value="not-met">{m.learning_current_notmet()}</option>
          <option value="met">{m.learning_current_met()}</option>
          <option value="stale">{m.learning_current_stale()}</option>
        </select>
      </label>
      {#if filtered.length === 0}
        <div class="empty-records">
          <p>{m.progress_no_characters()}</p>
          <button type="button" class="btn-ghost" onclick={() => void changeFilter('all', true)}>
            {m.progress_show_all_characters()}
          </button>
        </div>
      {:else}
        <!-- Keyboard users must be able to scroll this named region. -->
        <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
        <div
          bind:this={scrollRegion}
          class="character-scroll"
          role="region"
          tabindex="0"
          aria-label={m.progress_tab_characters()}
        >
          <ul>
            {#each filtered as character (character.character)}
              <li>
                <details class="character-evidence">
                  <summary>
                    <strong>{character.character}</strong>
                    <span>{characterCheckLabel(character)}</span>
                    <ChevronDown size={20} aria-hidden="true" />
                  </summary>
                  <div class="evidence-details">
                    {#if character.current.counts && character.current.counts.eligible > 0}<p>
                        {m.mixed_count({
                          character: character.character,
                          correct: character.current.counts.unassistedCorrect,
                          total: character.current.counts.eligible
                        })}
                      </p>{/if}
                    <h3>{m.progress_past_milestones()}</h3>
                    <dl>
                      <div>
                        <dt>{m.learning_proficiency()}</dt>
                        <dd>{award(character.proficiency)}</dd>
                      </div>
                      <div>
                        <dt>{m.learning_retention()}</dt>
                        <dd>{award(character.retention)}</dd>
                      </div>
                    </dl>
                    {#if character.evidence.revalidation.length || character.evidence.historical.some((a) => a.status === 'unverified')}<p
                      >
                        {m.learning_claim_uncertain()}
                      </p>{/if}
                    {#if character.review && snapshot.coverage !== 'partial'}
                      {#if character.review.lastExposureAt}
                        <p>
                          {m.learning_last_heard({
                            character: character.character,
                            date: formatDateTime(character.review.lastExposureAt)
                          })}
                        </p>
                      {/if}
                      <p>
                        {character.review.ready
                          ? m.learning_review_due()
                          : character.review.actionableAt
                            ? m.learning_review_on({
                                date: formatDateTime(character.review.actionableAt)
                              })
                            : m.learning_review_wait()}
                      </p>
                    {/if}
                    {#if snapshot.knownCharacters.length >= 2 && snapshot.knownCharacters.includes(character.character)}
                      <p>
                        {m.check_character_plan({
                          targets: LEARNING_POLICY.opportunitiesPerTarget,
                          character: character.character,
                          other: LEARNING_POLICY.anchorCount
                        })}
                      </p>
                      <p>{m.check_first_credit()}</p>
                      <a
                        class="link"
                        onclick={prepareCheckLink}
                        href={localizedHref(
                          `/morse/learn/session?check=${encodeURIComponent(character.character)}`
                        )}>{m.learning_check({ character: character.character })}</a
                      >
                    {:else}
                      <p>
                        {snapshot.knownCharacters.includes(character.character)
                          ? m.learning_check_needs_partner()
                          : m.learning_check_needs_target({ character: character.character })}
                      </p>
                      <a class="link" href={localizedHref('/morse')}>{m.morse_title()}</a>
                    {/if}
                  </div>
                </details>
              </li>
            {/each}
          </ul>
        </div>
        <p class="record-note">{m.learning_history_hint()}</p>
      {/if}
    </div>
  {/if}
</section>

<style>
  .record-count {
    margin-top: var(--space-2);
    font-size: var(--text-sm);
  }
  .record-note {
    margin-top: var(--space-6);
    font-size: var(--text-sm);
  }
  .empty-records {
    display: grid;
    justify-items: start;
    gap: var(--space-3);
    padding-block: var(--space-4);
  }
  .evidence-details h3 {
    margin: 0;
    font-size: var(--text-base);
  }
  .character-evidence summary,
  .evidence-details a {
    scroll-margin-block: 6rem;
  }
  .character-scroll:focus-visible {
    outline: 2px solid var(--focus-color);
    outline-offset: 4px;
  }
  .character-content {
    width: 100%;
  }
  .character-scroll ul {
    grid-template-columns: minmax(0, 1fr);
  }
  .character-filter {
    display: grid;
    gap: var(--space-3);
    width: 100%;
    position: sticky;
    top: 0;
    z-index: 2;
    padding-block: var(--space-3);
    background: var(--bg-base);
  }
  .character-filter select {
    min-height: 48px;
    min-width: 0;
  }
  .character-scroll {
    width: 100%;
  }
  @media (min-width: 960px) and (min-height: 700px) {
    .character-scroll {
      max-height: min(55dvh, max(12rem, calc(100dvh - 24rem)));
      overflow-y: auto;
      scrollbar-gutter: stable;
      padding-right: var(--space-2);
    }
    .character-filter select {
      max-width: 24rem;
    }
  }

  .recommendation {
    display: contents;
  }
  .progress-evidence {
    gap: var(--space-6);
  }
  .progress-evidence .recommendation {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-6);
    padding: min(var(--space-6), 24px);
    width: 100%;
    background: var(--bg-surface);
    border-radius: var(--radius-lg);
  }
  .secondary .recommendation h2 {
    font-size: var(--text-lg);
  }
  .progress-evidence header p {
    font-size: var(--text-sm);
  }
  .progress-evidence .recommendation .btn-primary {
    flex-shrink: 0;
    min-height: 3.25rem;
  }
  .progress-evidence > p {
    font-size: var(--text-sm);
  }
  .character-evidence {
    width: 100%;
  }
  .character-evidence summary {
    display: flex;
    align-items: center;
    gap: min(var(--space-4), 16px);
    min-height: 4.5rem;
    padding: min(var(--space-4), 16px);
    cursor: pointer;
    list-style: none;
  }
  .character-evidence summary::-webkit-details-marker {
    display: none;
  }
  .character-evidence summary :global(svg) {
    margin-left: auto;
    flex-shrink: 0;
    color: var(--text-muted);
  }
  .character-evidence[open] summary :global(svg) {
    transform: rotate(180deg);
  }
  .character-evidence summary strong {
    min-width: min(2rem, 32px);
    flex-shrink: 0;
    font-size: var(--text-2xl);
  }
  .character-evidence summary span {
    min-width: 0;
    font-size: var(--text-sm);
    color: var(--text-secondary);
  }
  .evidence-details {
    display: grid;
    gap: var(--space-3);
    padding: 0 min(var(--space-4), 16px) min(var(--space-4), 16px);
  }
  @media (max-width: 639px) {
    .progress-evidence .recommendation {
      flex-direction: column;
      align-items: flex-start;
    }
  }

  .learning-overview {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-4);
    width: 100%;
  }
  header {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  h2,
  p,
  dl {
    margin: 0;
  }
  h2 {
    font-size: var(--text-xl);
  }
  p {
    color: var(--text-secondary);
    line-height: var(--leading-normal);
  }
  .supporting {
    font-size: var(--text-sm);
  }
  section a.link {
    min-height: 3rem;
    display: inline-flex;
    align-items: center;
  }
  a.btn-primary,
  button.btn-primary {
    min-height: 3rem;
    white-space: normal;
    text-align: center;
  }
  ul {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 22rem), 1fr));
    gap: var(--space-2);
    width: 100%;
  }
  li {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: 0;
    background: var(--bg-surface);
    border-radius: var(--radius-md);
  }
  dl {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  dl div {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: var(--space-4);
  }
  dd {
    margin: 0;
  }
  dt {
    color: var(--text-secondary);
  }
</style>
