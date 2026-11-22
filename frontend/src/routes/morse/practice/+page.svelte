<script lang="ts">
  import { afterNavigate, beforeNavigate, goto } from '$app/navigation';
  import { page } from '$app/state';
  import { onDestroy, onMount, tick } from 'svelte';
  import { SvelteMap } from 'svelte/reactivity';
  import ContinuousCopyPractice from '#lib/components/practice/ContinuousCopyPractice.svelte';
  import ExitSessionDialog from '#lib/components/learning/ExitSessionDialog.svelte';
  import InfoTip from '#lib/components/InfoTip.svelte';
  import SavedSessions from '#lib/components/learning/SavedSessions.svelte';
  import TrainingSyncStatus from '#lib/components/TrainingSyncStatus.svelte';
  import { readClientCwSettings, readStoredLesson } from '#lib/cwSync.ts';
  import { createSessionRepository } from '#lib/data/session-repository.ts';
  import { closeTrainingDb, openTrainingDb } from '#lib/data/training-db.ts';
  import { waitForHistoryRestore, type HistoryRestore } from '#lib/history-restore.ts';
  import { localizedHref } from '#lib/i18n.svelte.ts';
  import * as m from '#lib/paraglide/messages.js';
  import { SITE_NAME } from '#lib/seo.ts';
  import { createPracticeSessionRecord, type CopyAttempt } from '#lib/practice/copy-attempt.ts';
  import { createCopyCheckpointStore } from '#lib/practice/copy-checkpoint.svelte.ts';
  import { createPracticeDeparture } from '#lib/practice/departure.ts';
  import { LESSONS } from '#lib/training/sequence.ts';
  import type { TrainingSessionRecord } from '#lib/training/v2/types.ts';
  import {
    getTrainingOwner,
    subscribeTrainingSync,
    trainingSyncState
  } from '#lib/training-sync.svelte.ts';

  let practice = $state<{
    hasUnfinishedCopy: () => boolean;
    prepareToLeave: () => void;
    focusCopy: () => void;
  } | null>(null);
  const copyStore = createCopyCheckpointStore();

  let departure = $state.raw<ReturnType<typeof createPracticeDeparture> | null>(null);
  let returnFocus = $state<HTMLElement | null>(null);
  let navigationError = $state(false);
  let confirming = $state(false);
  let bypassDestination: string | null = null;
  let allowUnload = false;
  let destroyed = false;
  let historyRestore: HistoryRestore | null = null;

  let defaults = $state({ lesson: 1, charWpm: 20, effWpm: 12, freq: 600, startDelay: 0.5 });

  function loadDefaults() {
    const cw = readClientCwSettings();
    defaults = {
      lesson: readStoredLesson(LESSONS.length),
      charWpm: cw.char_wpm,
      effWpm: cw.eff_wpm,
      freq: cw.freq,
      startDelay: cw.start_delay
    };
  }

  async function saveCopyAndLeave() {
    const owner = practiceOwner;
    if (confirming || allowUnload || owner !== getTrainingOwner() || hasPendingResult) return;
    confirming = true;
    practice?.prepareToLeave();
    try {
      await tick();
      if (owner !== getTrainingOwner()) return;
      if (!(await copyStore.flushForDeparture()) || destroyed || owner !== getTrainingOwner())
        return;
      // Reopen Home in a fresh document after the checkpoint write succeeds.
      allowUnload = true;
      window.location.assign(localizedHref('/'));
    } finally {
      confirming = false;
    }
  }

  let persistenceStatus = $state<'saving' | 'saved' | 'failed' | null>(null);
  let pendingRecord: TrainingSessionRecord | null = null;
  let attemptOwner: string | null = null;
  let recordOwner: string | null = null;
  let practiceOwner = $state('unclaimed');
  const unsavedRecords = new SvelteMap<string, TrainingSessionRecord>();
  const hasPendingResult = $derived(unsavedRecords.has(practiceOwner));

  function recordPractice(attempt: CopyAttempt) {
    if (attemptOwner === null || attemptOwner !== getTrainingOwner()) return;
    recordOwner = attemptOwner;
    pendingRecord = createPracticeSessionRecord(attempt, attempt.id ?? crypto.randomUUID());
    if (pendingRecord) {
      unsavedRecords.set(recordOwner, pendingRecord);
      void savePractice();
    }
  }

  async function savePractice() {
    if (!pendingRecord || persistenceStatus === 'saving') return;
    const record = pendingRecord;
    const owner = recordOwner ?? getTrainingOwner();
    persistenceStatus = 'saving';
    let db: IDBDatabase | null = null;
    try {
      db = await openTrainingDb();
      await createSessionRepository(db, owner).saveSession(record);
      await tick();
      await copyStore.clearForAttempt(record.id, owner);
      if (unsavedRecords.get(owner) === record) unsavedRecords.delete(owner);
      if (owner === getTrainingOwner() && pendingRecord === record) {
        pendingRecord = null;
        persistenceStatus = 'saved';
      }
    } catch (error) {
      console.error('Failed to save practice history:', error);
      if (owner === getTrainingOwner() && pendingRecord === record) persistenceStatus = 'failed';
    } finally {
      if (db) closeTrainingDb(db);
    }
  }

  function hasWorkAtRisk() {
    return hasPendingResult || Boolean(practice?.hasUnfinishedCopy());
  }

  beforeNavigate((navigation) => {
    if (allowUnload || navigation.to?.url.href === bypassDestination) {
      bypassDestination = null;
      return;
    }
    if (!hasWorkAtRisk()) return;
    if (!navigation.to) {
      navigation.cancel();
      return;
    }
    const source = navigation.from?.url ?? page.url;
    const target = navigation.to.url;
    if (source.pathname === target.pathname && source.search === target.search) return;
    navigation.cancel();
    if (departure) return;
    returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    practice?.prepareToLeave();
    const owner = getTrainingOwner();
    const delta = navigation.type === 'popstate' ? navigation.delta : null;
    navigationError = false;
    const restore = delta === null ? null : waitForHistoryRestore(source.href);
    historyRestore = restore;
    departure = createPracticeDeparture(
      restore?.promise ?? Promise.resolve(),
      () => {
        bypassDestination = target.href;
        if (delta !== null) window.history.go(delta);
        else if (navigation.willUnload) {
          allowUnload = true;
          window.location.assign(target.href);
        } else return goto(target.href);
      },
      () => !destroyed && owner === getTrainingOwner()
    );
  });

  async function cancelDeparture() {
    departure?.cancel();
    departure = null;
    historyRestore?.cancel();
    historyRestore = null;
    navigationError = false;
    await tick();
    if (!returnFocus?.isConnected) practice?.focusCopy();
  }

  async function confirmDeparture(saveDraft: boolean) {
    if (!departure || confirming || practiceOwner !== getTrainingOwner()) return;
    const pending = departure;
    confirming = true;
    navigationError = false;
    try {
      if (saveDraft) {
        await tick();
        if (departure !== pending || practiceOwner !== getTrainingOwner()) return;
        if (!(await copyStore.flushForDeparture())) return;
      } else await copyStore.clear();
      if (await pending.confirm()) departure = null;
    } catch {
      if (departure !== pending) return;
      bypassDestination = null;
      allowUnload = false;
      navigationError = true;
    } finally {
      confirming = false;
    }
  }

  afterNavigate(() => {
    bypassDestination = null;
    allowUnload = false;
  });
  onDestroy(() => {
    destroyed = true;
    void copyStore.dispose();
    departure?.cancel();
    historyRestore?.cancel();
  });

  function handleBeforeUnload(event: BeforeUnloadEvent) {
    if (!allowUnload && hasWorkAtRisk()) {
      event.preventDefault();
      event.returnValue = '';
    }
  }

  async function loadEntry() {
    const owner = getTrainingOwner();
    const resumeRequested = page.url.searchParams.get('resume') === 'copy';
    await copyStore.load();
    if (resumeRequested && !destroyed && owner === getTrainingOwner() && copyStore.saved) {
      await copyStore.resume(copyStore.saved);
    }
  }

  // Keep existing character-explorer bookmarks useful after giving the tool its own page.
  onMount(() => {
    practiceOwner = getTrainingOwner();
    loadDefaults();
    void loadEntry();
    const unsubscribe = subscribeTrainingSync(() => {
      const owner = getTrainingOwner();
      if (practiceOwner === owner) return;
      void cancelDeparture();
      practiceOwner = owner;
      void copyStore.load();
      loadDefaults();
      attemptOwner = null;
      recordOwner = owner;
      pendingRecord = unsavedRecords.get(owner) ?? null;
      persistenceStatus = pendingRecord ? 'failed' : null;
    });
    if (page.url.searchParams.get('mode') === 'familiarize') {
      void goto(localizedHref('/morse'), { replace: true });
    }
    return unsubscribe;
  });
</script>

<svelte:window onbeforeunload={handleBeforeUnload} />

<svelte:head>
  <title>{m.nav_practice()} · {SITE_NAME}</title>
</svelte:head>

<div class="practice-page training-page">
  <header class="practice-header">
    <div class="practice-title">
      <h1 class="page-title training-title">{m.nav_practice()}</h1>
      <InfoTip
        heading
        label={m.common_tip_label({ topic: m.nav_practice() })}
        text={m.practice_mastery_notice()}
      />
    </div>
    {#if !copyStore.loading && !copyStore.blocked && !copyStore.saved && copyStore.hasWork && !hasPendingResult}<button
        class="btn-ghost"
        disabled={confirming}
        onclick={() => void saveCopyAndLeave()}>{m.session_save_leave()}</button
      >{/if}
  </header>

  <TrainingSyncStatus
    owner={trainingSyncState.owner}
    pending={trainingSyncState.pending}
    error={trainingSyncState.error}
    syncing={trainingSyncState.syncing}
    synced={trainingSyncState.synced}
  />
  {#if copyStore.blocked}<p role="alert">{m.session_resume_error()}</p>
    <button class="btn-ghost" onclick={() => void copyStore.load()}>{m.common_retry()}</button>
  {:else if copyStore.saveError}<p role="alert">{m.session_save_error()}</p>
    <button class="btn-ghost" onclick={() => copyStore.retry()}>{m.common_retry()}</button>
  {/if}
  {#if copyStore.loading}<p role="status">{m.common_loading()}</p>
  {:else if copyStore.saved && !copyStore.blocked}<SavedSessions
      entries={[copyStore.saved]}
      onContinue={(entry) => void copyStore.resume(entry)}
      onDiscard={(entry) => void copyStore.discard(entry)}
    />
  {:else if !copyStore.blocked}
    {#key practiceOwner}
      <ContinuousCopyPractice
        resume={copyStore.restore}
        onCheckpoint={copyStore.checkpoint}
        bind:this={practice}
        {...defaults}
        onFinish={() => void goto(localizedHref('/'))}
        onStart={() => {
          attemptOwner ??= getTrainingOwner();
        }}
        onReview={recordPractice}
        {persistenceStatus}
        onRetrySave={() => void savePractice()}
      />
    {/key}
  {/if}
</div>

<ExitSessionDialog
  isOpen={departure !== null}
  title={hasPendingResult ? m.practice_leave_title() : m.practice_save_draft_question()}
  description={copyStore.saveError
    ? m.session_save_error()
    : navigationError
      ? m.practice_navigation_error()
      : hasPendingResult
        ? m.lesson_save_discard_hint()
        : m.practice_leave_description()}
  confirmLabel={hasPendingResult ? m.lesson_leave_unsaved() : m.practice_discard_leave()}
  cancelLabel={m.practice_keep_result()}
  returnFocusTo={returnFocus}
  onCancel={() => void cancelDeparture()}
  busy={confirming}
  onSaveLeave={hasPendingResult ? undefined : () => void confirmDeparture(true)}
  saveLabel={m.practice_save_continue()}
  onConfirm={() => void confirmDeparture(false)}
/>

<style>
  .practice-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin-bottom: var(--space-8);
    --tip-trigger-size: 48px;
  }
  .practice-title {
    display: flex;
    align-items: center;
    gap: 2px;
  }
  .practice-page :global(.saved-sessions) {
    padding: var(--space-6);
    background: var(--bg-surface);
    border-radius: var(--radius-lg);
  }
</style>
