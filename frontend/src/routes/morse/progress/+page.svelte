<script lang="ts">
  import { browser } from '$app/env';
  import { page } from '$app/state';
  const view = $derived(
    browser && ['characters', 'history'].includes(page.url.searchParams.get('view') ?? '')
      ? page.url.searchParams.get('view')
      : 'overview'
  );

  import LearningHistory from '#lib/components/learning/LearningHistory.svelte';
  import { createLearningView } from '#lib/learning-view.svelte.ts';
  import LearningOverview from '#lib/components/learning/LearningOverview.svelte';
  const learning = createLearningView();
  import { onMount } from 'svelte';
  import { CircleCheck, CircleMinus, Dumbbell, History, Radio } from '@lucide/svelte';
  import TrainingSyncStatus from '#lib/components/TrainingSyncStatus.svelte';
  import InfoTip from '#lib/components/InfoTip.svelte';
  import {
    getTrainingOwner,
    trainingSyncState,
    subscribeTrainingSync
  } from '#lib/training-sync.svelte.ts';
  import { localizedHref } from '#lib/i18n.svelte.ts';
  import { SITE_NAME } from '#lib/seo.ts';
  import { formatDateTime, formatPercent } from '#lib/format.ts';
  import { closeTrainingDb, openTrainingDb } from '#lib/data/training-db.ts';
  import { createAttemptRepository } from '#lib/data/attempt-repository.ts';
  import { createSessionRepository } from '#lib/data/session-repository.ts';
  import {
    historyWithAnswerAccuracy,
    sessionOccurredAt,
    summarizeProgress,
    type ProgressSummary
  } from '#lib/training/v2/progress-summary.ts';
  import { deriveGuidedLessonAccess } from '#lib/training/v2/lesson-access.ts';
  import type { HistorySessionRecord } from '#lib/training/v2/types.ts';
  import { LESSONS } from '#lib/training/sequence.ts';
  import CharacterMasteryGrid from '#lib/components/progress/CharacterMasteryGrid.svelte';
  import ConfusionList from '#lib/components/progress/ConfusionList.svelte';
  import PracticeActivity from '#lib/components/progress/PracticeActivity.svelte';
  import * as m from '#lib/paraglide/messages.js';
  import { recordedCharacters } from '#lib/training/targeted-review.ts';
  import { listCheckpoints, type SessionCheckpoint } from '#lib/data/session-checkpoints.ts';
  import {
    confusionSummary,
    isOptionalCheck,
    guidedRepeatPair,
    savedSessionAction
  } from '#lib/components/learning/recommendation-copy.ts';
  import { loadLearningPilotHistory, type LearningPilotHistory } from '#lib/data/learning-pilot.ts';

  const TABS = [
    { value: 'overview', label: m.progress_tab_overview },
    { value: 'characters', label: m.progress_tab_characters },
    { value: 'history', label: m.progress_tab_history }
  ] as const;

  let showHistory = $state(false);
  let loading = $state(true);
  let loadError = $state(false);
  let summary = $state.raw<ProgressSummary | null>(null);
  let history = $state.raw<HistorySessionRecord[]>([]);
  let knownCharacters = $state.raw<string[]>([]);
  let savedSession = $state.raw<SessionCheckpoint | null>(null);
  const resumeAction = $derived(savedSession ? savedSessionAction(savedSession) : null);
  const optionalCheck = $derived(
    learning.snapshot && isOptionalCheck(learning.snapshot.recommendation.primary)
  );
  let guidedUnlockedStep = $state(1);
  let reviewHistory = $state.raw<LearningPilotHistory[]>([]);
  let reviewHistoryError = $state(false);
  const hasActivity = $derived(
    savedSession ||
      summary?.hasRecentActivity ||
      history.length > 0 ||
      reviewHistory.length > 0 ||
      learning.snapshot?.knownCharacters.length ||
      learning.snapshot?.history.length ||
      learning.snapshot?.hasProspectiveEvidence
  );
  const pilotCharacters = $derived(
    recordedCharacters(reviewHistory.flatMap((review) => review.attempts))
  );
  const characterRecords = $derived(
    learning.snapshot?.characters.filter(
      (c) => c.hasGuidedRecord || pilotCharacters.includes(c.character)
    ) ?? []
  );
  const featuredPair = $derived(
    optionalCheck && !resumeAction && characterRecords.length && summary
      ? guidedRepeatPair(summary.confusionPairs, guidedUnlockedStep)
      : undefined
  );
  let mounted = false;
  let loadVersion = 0;
  let loadedOwner: string | null = null;
  let activeDb: IDBDatabase | null = null;

  async function loadProgress() {
    const owner = getTrainingOwner();
    const version = ++loadVersion;
    const current = () => mounted && version === loadVersion && owner === getTrainingOwner();
    // Background history updates replace the result only after they finish.
    if (owner !== loadedOwner) {
      loadedOwner = null;
      summary = null;
      history = [];
      knownCharacters = [];
      guidedUnlockedStep = 1;
      savedSession = null;
      reviewHistory = [];
      showHistory = false;
      loading = true;
    }
    loadError = false;
    let db: IDBDatabase | null = null;
    try {
      db = await openTrainingDb();
      if (!current()) return;
      activeDb = db;
      const now = Date.now();
      const nowIso = new Date(now).toISOString();
      const repository = createSessionRepository(db, owner);
      const attemptRepository = createAttemptRepository(db, owner);
      const [attempts, sessions, checkpoints] = await Promise.all([
        attemptRepository.getAttemptsByTimeRange('0001-01-01T00:00:00.000Z', nowIso),
        repository.getSessions(),
        listCheckpoints(owner)
      ]);
      if (!current()) return;
      savedSession = checkpoints[0] ?? null;
      knownCharacters = recordedCharacters(attempts);
      guidedUnlockedStep = deriveGuidedLessonAccess(attempts, nowIso).unlockedStep;
      summary = summarizeProgress(attempts, sessions, nowIso);
      history = historyWithAnswerAccuracy(
        sessions.filter((session) => session.status !== 'in-progress').slice(0, 20),
        attempts
      );
      loadedOwner = owner;
      try {
        const reviews = await loadLearningPilotHistory(owner);
        if (current()) {
          reviewHistory = reviews
            .filter((review) => review.status !== 'in-progress' || review.completedPromptCount > 0)
            .slice(0, 10);
          reviewHistoryError = false;
        }
      } catch {
        if (current()) reviewHistoryError = true;
      }
    } catch (error) {
      if (current()) {
        console.error('Failed to load progress data:', error);
        loadError = true;
      }
    } finally {
      if (db) closeTrainingDb(db);
      if (activeDb === db) activeDb = null;
      if (current()) loading = false;
    }
  }

  onMount(() => {
    const stopLearning = learning.start();
    mounted = true;
    let revision = '';
    const unsubscribe = subscribeTrainingSync((state) => {
      const next = `${state.owner}:${state.version}`;
      if (revision === next) return;
      revision = next;
      void loadProgress();
    });
    return () => {
      unsubscribe();
      stopLearning();
      mounted = false;
      loadVersion++;
      if (activeDb) closeTrainingDb(activeDb);
    };
  });
</script>

<svelte:head>
  <title>{m.nav_progress()} · {SITE_NAME}</title>
</svelte:head>

<div class="progress-page training-page">
  <div class="progress-container">
    <header class="progress-header">
      <h1 class="page-title training-title">{m.nav_progress()}</h1>
    </header>
    <nav class="section-nav" aria-label={m.nav_progress()}>
      {#each TABS as tab (tab.value)}
        <a
          href={localizedHref(
            `/morse/progress?view=${tab.value}${browser && page.url.searchParams.has('status') ? `&status=${encodeURIComponent(page.url.searchParams.get('status')!)}` : ''}`
          )}
          aria-current={view === tab.value ? 'page' : undefined}>{tab.label()}</a
        >
      {/each}
    </nav>

    <TrainingSyncStatus
      owner={trainingSyncState.owner}
      pending={trainingSyncState.pending}
      syncing={trainingSyncState.syncing}
      synced={trainingSyncState.synced}
      error={trainingSyncState.error}
    />

    {#if loadError || learning.failed || (reviewHistoryError && !hasActivity)}
      <div class="progress-section">
        <p role="alert">{m.progress_load_error()}</p>
        <button
          type="button"
          class="btn-primary"
          onclick={() => {
            void loadProgress();
            void learning.refresh();
          }}>{m.progress_retry()}</button
        >
      </div>
    {:else if loading || !learning.snapshot}
      <div class="loading-card" role="status">
        <span class="sr-only">{m.common_loading()}</span>
        <div class="skeleton loading-card" aria-hidden="true"></div>
      </div>
    {:else if summary}
      {#if learning.snapshot.coverage === 'partial'}
        <p role="status" class="progress-subtitle">{m.learning_coverage_partial()}</p>
      {/if}
      {#if !hasActivity && learning.snapshot.coverage === 'partial'}
        <a class="link" href={localizedHref('/settings#learning-evidence')}
          >{m.learning_next_history()}</a
        >
      {:else if !hasActivity}
        <section class="progress-section progress-empty" aria-labelledby="empty-heading">
          <h2 id="empty-heading" class="section-title">{m.progress_empty_title()}</h2>
          <p class="progress-subtitle">{m.progress_empty_description()}</p>
          <a class="btn-primary" href={localizedHref('/morse/learn')}
            >{m.progress_return_course()}</a
          >
        </section>
      {:else}
        {#if view === 'overview' && resumeAction}
          <div class="guided-next">
            {#if resumeAction.hint}<p>{resumeAction.hint}</p>{/if}
            <a class="btn-primary" href={localizedHref(resumeAction.path)}>{resumeAction.title}</a>
          </div>
        {/if}
        {#if view === 'overview'}<PracticeActivity
            progressPage
            sessionCount={summary.sessionCount}
            guidedSessionCount={summary.guidedSessionCount}
            practiceSessionCount={summary.practiceSessionCount}
            legacySessionCount={summary.legacySessionCount}
            totalMinutes={summary.totalMinutes}
            timedSessionCount={summary.timedSessionCount}
            accuracyPercent={summary.accuracyPercent}
          />
        {/if}
        {#if view === 'overview' && !resumeAction && optionalCheck && characterRecords.length}
          <div class="guided-next">
            {#if featuredPair}<p>{confusionSummary(featuredPair)}</p>{/if}
            <a
              class="btn-primary"
              href={localizedHref('/morse/learn/session?step=' + guidedUnlockedStep)}
              >{m.learn_start_action({ step: guidedUnlockedStep })}</a
            >
          </div>
        {/if}
        {#if view === 'overview' && !learning.snapshot?.checks.length && (summary.confusionPairs.length > 0 || summary.slowChars.length > 0)}
          <section class="progress-section" aria-label={m.progress_attention()}>
            <ConfusionList
              confusionPairs={summary.confusionPairs}
              slowChars={summary.slowChars}
              {knownCharacters}
              {featuredPair}
            />
          </section>
        {/if}

        {#if characterRecords.length && (view === 'characters' || (view === 'overview' && learning.snapshot.knownCharacters.length >= 2))}
          <LearningOverview
            snapshot={learning.snapshot}
            {characterRecords}
            unlockedLesson={guidedUnlockedStep}
            secondary={Boolean(resumeAction || optionalCheck)}
            details
            progressView={view}
          />
        {/if}
        {#if view !== 'history' && characterRecords.length === 0}
          <section
            class="progress-section progress-empty"
            aria-labelledby="character-empty-heading"
          >
            <h2 class="section-title" id="character-empty-heading">
              {m.progress_no_guided_characters()}
            </h2>
            <p class="progress-subtitle">{m.progress_guided_characters_hint()}</p>
            {#if summary.hasPracticeHistory}
              <a class="link" href={localizedHref('/morse/progress?view=history')}
                >{m.progress_view_practice_history()}</a
              >
            {/if}
            <a class={resumeAction ? 'link' : 'btn-primary'} href={localizedHref('/morse/learn')}
              >{m.progress_return_course()}</a
            >
          </section>
        {/if}
        {#if view === 'overview' && characterRecords.length}
          {#if !learning.snapshot.hasMixedCheckHistory}
            <section class="check-summary" aria-label={m.progress_tab_characters()}>
              {#if learning.snapshot.coverage !== 'partial'}<p>{m.progress_no_checks_yet()}</p>{/if}
              <a
                class="link standalone-target"
                href={localizedHref('/morse/progress?view=characters')}
                >{m.progress_view_characters()}</a
              >
            </section>
          {:else}
            <section class="check-summary" aria-labelledby="check-summary-title">
              <h2 id="check-summary-title" class="section-title">{m.progress_latest_check()}</h2>
              <div class="recall-summary">
                {#each [['not-met', m.progress_below_target()], ['met', m.progress_passed()], ['stale', m.progress_no_current_result()]] as [criterion, label] (criterion)}
                  <a
                    aria-describedby="check-summary-title"
                    href={localizedHref(`/morse/progress?view=characters&status=${criterion}`)}
                  >
                    <span>{label}</span>
                    <strong
                      >{characterRecords.filter((c) =>
                        criterion === 'stale'
                          ? !['met', 'not-met'].includes(c.current.criterion)
                          : c.current.criterion === criterion
                      ).length}</strong
                    >
                  </a>
                {/each}
              </div>
            </section>
          {/if}
        {/if}
        {#if view === 'history'}
          <section class="progress-section" aria-labelledby="recent-sessions-heading">
            <div class="section-heading">
              <h2 id="recent-sessions-heading" class="section-title">
                {m.progress_history_heading()}
              </h2>
              <InfoTip
                label={m.common_tip_label({ topic: m.progress_history_heading() })}
                text={m.history_unknown_hint()}
              />
            </div>
            {#if history.length > 0}
              <ol class="history-list" role="list">
                {#each showHistory ? history : history.slice(0, 5) as session (session.id)}
                  {@const introduced = LESSONS[session.step - 1]?.split('').join(', ')}
                  <li class="history-row">
                    <div class="session-summary">
                      <div class="session-copy">
                        <strong class="session-title">
                          {#if session.mode === 'practice'}
                            <Dumbbell size={18} class="practice-icon" aria-hidden="true" />
                            {#if session.practiceContext === 'groups'}
                              {m.practice_history_groups({ step: session.step })}
                            {:else if session.practiceContext === 'words'}
                              {m.context_words()}
                            {:else if session.practiceContext === 'callsigns'}
                              {m.context_callsigns()}
                            {:else if session.practiceContext === 'contact'}
                              {m.context_contact()}
                            {:else}
                              {m.practice_passage()}
                            {/if}
                          {:else if session.mode === 'legacy'}
                            <History size={18} aria-hidden="true" />
                            {m.progress_history_legacy_lesson({ step: session.step })}
                          {:else}
                            <Radio size={18} aria-hidden="true" />
                            {introduced
                              ? m.progress_history_lesson_characters({
                                  step: session.step,
                                  characters: introduced
                                })
                              : m.progress_history_lesson({ step: session.step })}
                          {/if}
                        </strong>
                        <time datetime={sessionOccurredAt(session)}
                          >{formatDateTime(sessionOccurredAt(session))}</time
                        >
                      </div>
                      <span class="session-status" class:abandoned={session.status === 'abandoned'}>
                        {#if session.status === 'abandoned'}
                          <CircleMinus size={14} aria-hidden="true" />{m.history_abandoned()}
                        {:else}
                          <CircleCheck size={14} aria-hidden="true" />{m.history_completed()}
                        {/if}
                      </span>
                    </div>
                    <dl class="session-metrics">
                      <div>
                        <dt>{m.profile_cw_char_wpm()}</dt>
                        <dd>{session.charWpm ?? m.progress_unmeasured()}</dd>
                      </div>
                      <div>
                        <dt>{m.profile_cw_eff_wpm()}</dt>
                        <dd>{session.effWpm ?? m.progress_unmeasured()}</dd>
                      </div>
                      <div>
                        <dt>
                          {session.mode === 'practice'
                            ? m.practice_passage_accuracy()
                            : m.profile_history_accuracy()}
                        </dt>
                        <dd>
                          {session.accuracy == null
                            ? m.progress_unmeasured()
                            : formatPercent(session.accuracy)}
                          {#if session.accuracy != null}
                            <span class="accuracy-bar" aria-hidden="true">
                              <span style:width={`${session.accuracy * 100}%`}></span>
                            </span>
                          {/if}
                        </dd>
                      </div>
                    </dl>
                  </li>
                {/each}
              </ol>
              {#if history.length > 5}
                <button
                  type="button"
                  class="btn-ghost history-toggle"
                  aria-expanded={showHistory}
                  onclick={() => (showHistory = !showHistory)}
                  >{showHistory ? m.common_show_less() : m.progress_show_history()}</button
                >
              {/if}
            {:else}
              <p class="progress-subtitle">{m.progress_empty_description()}</p>
            {/if}
          </section>

          <details class="progress-section ui-disclosure">
            <summary>{m.progress_mastery_heading()}</summary>
            <p>{m.learning_legacy_hint()}</p>
            <CharacterMasteryGrid masteryMap={summary.masteryMap} />
          </details>
        {/if}
      {/if}
    {/if}
    {#if view === 'history' && learning.snapshot?.history.length}<details
        class="progress-section ui-disclosure"
      >
        <summary>{m.history_learning()}</summary>
        <LearningHistory entries={learning.snapshot.history} />
      </details>{/if}

    {#if view === 'history' && (reviewHistory.length || (reviewHistoryError && hasActivity))}
      <details class="progress-section ui-disclosure" open={reviewHistoryError}>
        <summary>{m.review_history_heading()}</summary>
        <p class="progress-subtitle">{m.review_local_only()}</p>
        {#if reviewHistoryError}<p role="alert">{m.progress_load_error()}</p>
          <button class="btn-ghost" onclick={loadProgress}>{m.progress_retry()}</button>{/if}
        <ol class="history-list">
          {#each reviewHistory as review (review.id)}
            <li class="history-row">
              <div class="session-summary">
                <strong
                  >{review.purpose === 'coaching'
                    ? m.review_title({ characters: review.targets.join(', ') })
                    : m.review_return_title()}</strong
                ><time datetime={review.completedAt ?? review.startedAt}
                  >{formatDateTime(review.completedAt ?? review.startedAt)}</time
                ><span>{m.review_answer_count({ count: review.attempts.length })}</span>
              </div>
              <span
                >{review.status === 'completed'
                  ? m.review_result_title()
                  : m.review_unfinished()}</span
              >
            </li>
          {/each}
        </ol>
      </details>
    {/if}
  </div>
</div>

<style>
  .section-nav {
    flex-wrap: wrap;
    container: progress-tabs / inline-size;
  }
  .section-nav a {
    flex-shrink: 0;
    white-space: nowrap;
  }
  @container progress-tabs (width < 16rem) {
    .section-nav a {
      flex-grow: 0;
    }
  }
  .guided-next {
    display: grid;
    justify-items: start;
    gap: var(--space-3);
  }
  .check-summary {
    display: grid;
    gap: var(--space-2);
  }
  .check-summary > a {
    justify-self: start;
  }
  .recall-summary {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--space-4);
  }
  .recall-summary a {
    display: grid;
    gap: var(--space-3);
    min-height: 48px;
    text-decoration: none;
    color: var(--text-secondary);
  }
  .recall-summary strong {
    color: var(--text-primary);
    font-size: var(--text-xl);
  }
  @media (max-width: 639px) {
    .recall-summary {
      grid-template-columns: 1fr;
    }
    .recall-summary a {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
  }

  .history-toggle {
    align-self: flex-start;
    min-height: var(--answer-target-min);
  }
  .history-list {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .history-row {
    display: grid;
    gap: var(--space-3);
    padding: var(--space-4) 0;
    border-bottom: 1px solid var(--border);
  }
  .history-row:first-child {
    padding-top: 0;
  }
  .session-summary,
  .session-title,
  .session-status {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }
  .session-summary {
    justify-content: space-between;
    flex-wrap: wrap;
  }
  .session-title :global(svg) {
    flex-shrink: 0;
    color: var(--accent);
  }
  .session-title :global(.practice-icon) {
    color: var(--status-extra);
  }
  time,
  dt {
    color: var(--text-secondary);
    font-size: var(--text-xs);
  }
  time {
    display: block;
    margin-top: var(--space-1);
  }
  .session-status {
    color: var(--status-good);
    font-size: var(--text-xs);
    gap: var(--space-1);
  }
  .session-status.abandoned {
    color: var(--status-ok);
  }
  .session-metrics {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--space-3);
    margin: 0;
    font-size: var(--text-sm);
    overflow-wrap: anywhere;
  }
  dd {
    margin: var(--space-1) 0 0;
    font-weight: 600;
  }
  .accuracy-bar {
    display: block;
    height: 4px;
    margin-top: var(--space-2);
    background: var(--progress-track);
  }
  .accuracy-bar > span {
    display: block;
    height: 100%;
    background: var(--progress-fill);
  }
  @media (min-width: 680px) {
    .history-row {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      gap: var(--space-6);
      align-items: center;
    }
  }

  .progress-empty {
    padding: min(var(--space-6), 24px);
    background: var(--bg-surface);
    border-radius: var(--radius-lg);
    align-items: flex-start;
    gap: var(--space-4);
  }
  .progress-empty .btn-primary {
    min-height: 3.25rem;
    margin-top: var(--space-2);
  }
  .progress-container :global(.learning-history) {
    margin-block: var(--space-4) 0;
  }
  .progress-container :global(.learning-history > h2) {
    display: none;
  }
  .progress-container {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: var(--space-8);
    width: 100%;
    margin: 0 auto;
    overflow-wrap: anywhere;
    hyphens: auto;
  }

  .progress-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: var(--space-3);
    width: 100%;
    text-align: start;
  }

  .progress-subtitle {
    margin: 0;
    font-size: var(--text-sm);
    color: var(--text-secondary);
    max-width: 28rem;
    line-height: var(--leading-normal);
  }

  .progress-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    width: 100%;
    max-width: none;
  }

  .section-title {
    margin: 0;
    font-size: var(--text-lg);
    font-weight: 700;
    color: var(--text-primary);
  }

  details.progress-section {
    display: block;
  }

  .section-heading {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .loading-card {
    height: 16rem;
    width: 100%;
    max-width: none;
  }
</style>
