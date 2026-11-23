import { describe, expect, it } from 'vitest';
import { comparePassage } from '../score';
import { canCheck } from '../training/session';
import { calculateDuration } from '../training/timing';
import {
  createCopyAttempt,
  emptyCopyAttempt,
  copyPlaybackEvent,
  createPracticeSessionRecord,
  selectedGroupLesson,
  reviewCopyAttempt,
  restoreCopyAttempt,
  copyInputLimit,
  boundCopyInput
} from './copy-attempt';
import { normalizePlaybackSettings } from './playback';

const settings = normalizePlaybackSettings({});
const create = () => createCopyAttempt(1, settings, undefined, () => 0);

describe('free copy attempt', () => {
  it('records a reviewed passage with its original playback time, score and settings', () => {
    const ready = createCopyAttempt(3, { ...settings, freq: 700 }, undefined, () => 0);
    expect(createPracticeSessionRecord(ready, 'practice-1')).toBeNull();
    expect(copyPlaybackEvent(ready, 'stop').startedAt).toBeUndefined();
    const started = copyPlaybackEvent(ready, 'start', '2026-10-16T00:00:00.000Z');
    const reviewed = reviewCopyAttempt(started, 'wrong', '2026-10-16T00:01:30.000Z');
    const record = createPracticeSessionRecord(reviewed, 'practice-1');
    expect(record).toEqual({
      schemaVersion: 1,
      id: 'practice-1',
      mode: 'practice',
      practiceContext: 'groups',
      accuracy: 0,
      step: 3,
      charWpm: settings.charWpm,
      effWpm: settings.effWpm,
      freqHz: 700,
      startedAt: '2026-10-16T00:00:00.000Z',
      completedAt: '2026-10-16T00:01:30.000Z',
      status: 'completed',
      promptCount: 1,
      completedPromptCount: 1
    });
    const replaying = copyPlaybackEvent(reviewed, 'start', '2026-10-16T00:02:00.000Z');
    expect(createPracticeSessionRecord(replaying, 'practice-1')).toEqual(record);
    expect(createCopyAttempt(3, settings, replaying).startedAt).toBeUndefined();
    expect(
      createPracticeSessionRecord({ ...reviewed, startedAt: undefined }, 'missing')
    ).toBeNull();
  });

  it.each(['words', 'callsigns', 'contact'] as const)(
    'keeps the selected groups lesson while practising %s',
    (context) => {
      const contextual = createCopyAttempt(2, settings, undefined, () => 0, context);
      expect(contextual.groupLesson).toBe(2);
      const result = reviewCopyAttempt(
        copyPlaybackEvent(contextual, 'start'),
        contextual.exercise.text
      );
      expect(createPracticeSessionRecord(result, 'p')).toMatchObject({
        practiceContext: context,
        accuracy: 1
      });
      const groups = createCopyAttempt(contextual.groupLesson!, settings, result, () => 0);
      expect(groups.exercise.lesson).toBe(2);
    }
  );

  it('keeps prerender state deterministic and unstarted', () => {
    expect(emptyCopyAttempt()).toEqual(emptyCopyAttempt());
    expect(emptyCopyAttempt().exercise.text).toBe('');
    expect(emptyCopyAttempt().session.status).toBe('ready');
  });

  it('restores the chosen group level from new and old checkpoints, even after checking', () => {
    const words = createCopyAttempt(3, settings, undefined, () => 0, 'words');
    const reviewed = reviewCopyAttempt(copyPlaybackEvent(words, 'start'), words.exercise.text);
    expect(selectedGroupLesson(structuredClone(reviewed), 1)).toBe(3);
    // Old contextual checkpoints only recorded 39, the size of the whole course.
    const oldWords = {
      ...reviewed,
      groupLesson: undefined,
      exercise: { ...words.exercise, lesson: 39 }
    };
    expect(selectedGroupLesson(oldWords, 7)).toBe(7);
    const oldGroups = { ...createCopyAttempt(3, settings), groupLesson: undefined };
    expect(selectedGroupLesson(oldGroups, 7)).toBe(3);
    expect(
      selectedGroupLesson(
        { ...oldGroups, exercise: { ...oldGroups.exercise, context: 'groups' } },
        7
      )
    ).toBe(3);
  });

  it('creates one stable exercise with a normalized settings snapshot and exact duration', () => {
    const attempt = createCopyAttempt(
      Number.NaN,
      { charWpm: 8, effWpm: 50, freq: Number.NaN, volume: 1, startDelay: 0 },
      undefined,
      () => 0
    );
    expect(attempt.exercise.lesson).toBe(1);
    expect(attempt.settings).toMatchObject({ charWpm: 8, effWpm: 8, freq: 600 });
    expect(attempt.duration).toBe(calculateDuration(attempt.exercise.text, 8, 8));
    const started = copyPlaybackEvent(attempt, 'start');
    expect(started.exercise).toBe(attempt.exercise);
    expect(canCheck(started.session)).toBe(true);
  });

  it('only reviews after a successful start and rejects empty input', () => {
    const attempt = create();
    expect(reviewCopyAttempt(attempt, 'K')).toBe(attempt);
    const started = copyPlaybackEvent(attempt, 'start');
    expect(reviewCopyAttempt(started, ' ')).toBe(started);
    const stopped = copyPlaybackEvent(started, 'stop');
    const reviewed = reviewCopyAttempt(stopped, stopped.exercise.text, '2026-10-16T00:00:00Z');
    expect(reviewed.review?.result).toMatchObject({
      lesson: 1,
      charWpm: settings.charWpm,
      effWpm: settings.effWpm,
      accuracy: 1,
      completedAt: '2026-10-16T00:00:00Z'
    });
    expect(reviewed.session.status).toBe('reviewed');
    expect(reviewCopyAttempt(reviewed, 'wrong')).toBe(reviewed);
  });

  it('replays a reviewed exercise for listening without allowing another score', () => {
    const started = copyPlaybackEvent(create(), 'start');
    const reviewed = reviewCopyAttempt(started, started.exercise.text);
    const replaying = copyPlaybackEvent(reviewed, 'start');
    expect(canCheck(replaying.session)).toBe(false);
    expect(copyPlaybackEvent(replaying, 'stop').session.status).toBe('reviewed');
    expect(replaying.review).toBe(reviewed.review);
  });

  it('replacing an active or reviewed attempt clears its review and requires new playback', () => {
    const started = copyPlaybackEvent(create(), 'start');
    for (const previous of [started, reviewCopyAttempt(started, started.exercise.text)]) {
      const next = createCopyAttempt(2, { ...settings, charWpm: 30 }, previous, () => 0);
      expect(next.exercise.lesson).toBe(2);
      expect(next.settings.charWpm).toBe(30);
      expect(next.session.attempt).toBe(previous.session.attempt + 1);
      expect(next.session.status).toBe('ready');
      expect(next.review).toBeNull();
      expect(canCheck(next.session)).toBe(false);
    }
  });

  it('bounds both pasted text and programmatic review input to the current passage', () => {
    const started = copyPlaybackEvent(create(), 'start');
    const limit = copyInputLimit(started.exercise.text);
    const input = 'X '.repeat(100_000);
    expect(boundCopyInput(started.exercise.text, input)).toHaveLength(limit);
    const reviewed = reviewCopyAttempt(started, input);
    expect(reviewed.review?.result.accuracy).toBe(0);
    expect(reviewed.review?.comparison).toEqual(
      comparePassage(started.exercise.text, input.slice(0, limit))
    );
    expect(copyInputLimit('')).toBe(1);
  });

  it('rebuilds corrections for older checked drafts without recording a new score', () => {
    const started = copyPlaybackEvent(create(), 'start');
    const checked = reviewCopyAttempt(started, 'K');
    const legacy = {
      ...checked,
      review: {
        result: checked.review!.result,
        diffTokens: [{ ref: 'OLD', inp: 'TOKEN', type: 'substitution' }]
      }
    };
    expect(restoreCopyAttempt(legacy, 'K').review?.comparison).toEqual(checked.review!.comparison);
    expect(createPracticeSessionRecord(legacy, 'same')).toEqual(
      createPracticeSessionRecord(checked, 'same')
    );
  });

  it('rebuilds persisted split-surrogate and malformed comparisons from the saved draft', () => {
    const started = copyPlaybackEvent(create(), 'start');
    started.exercise.text = 'KM';
    const checked = reviewCopyAttempt(started, 'K🦊');
    for (const comparison of [
      { accuracy: 0, differences: 2, groups: [[{ type: 'extra', ref: '', inp: '\ud83e' }]] },
      { accuracy: 0, differences: 2, groups: null }
    ]) {
      const saved = { ...checked, review: { result: checked.review!.result, comparison } };
      const restored = restoreCopyAttempt(saved as typeof checked, 'K🦊');
      expect(restored.review).toEqual(checked.review);
      expect(createPracticeSessionRecord(restored, 'same')).toEqual(
        createPracticeSessionRecord(checked, 'same')
      );
    }
  });

  it('keeps the original numeric grade when a draft was truncated inside an emoji', () => {
    const started = copyPlaybackEvent(create(), 'start');
    started.exercise.text = 'KM';
    const input = 'KMK🦊';
    const bounded = boundCopyInput('KM', input);
    expect(bounded).toBe('KMK\ud83e');
    const checked = reviewCopyAttempt(started, input);
    expect(checked.review?.comparison?.differences).toBe(2);
    expect(checked.review?.result.accuracy).toBe(0);
    expect(restoreCopyAttempt(checked, bounded).review).toEqual(checked.review);
  });

  it('preserves case, whitespace, insertion and deletion scoring within the copy limit', () => {
    const started = copyPlaybackEvent(create(), 'start');
    const copy = ` ${started.exercise.text.toLowerCase().replaceAll(' ', '\n')} `;
    expect(reviewCopyAttempt(started, copy).review?.result.accuracy).toBe(1);
    expect(boundCopyInput(started.exercise.text, copy)).toBe(copy);
    const inserted = `X${started.exercise.text}`;
    const deleted = started.exercise.text.slice(1);
    expect(reviewCopyAttempt(started, inserted).review?.result.accuracy).toBeGreaterThan(0);
    expect(reviewCopyAttempt(started, deleted).review?.result.accuracy).toBeGreaterThan(0);
  });
});
