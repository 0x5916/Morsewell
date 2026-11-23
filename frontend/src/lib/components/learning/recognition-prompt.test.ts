import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import RecognitionPrompt from './RecognitionPrompt.svelte';

const noop = () => {};
const props = {
  typed: false,
  options: ['K', 'M'],
  expected: 'K',
  entered: 'K',
  isCorrect: true,
  latencyMs: 1200,
  playingCharacter: null,
  audioError: null,
  onPlay: noop,
  onReplay: noop,
  onSelect: noop,
  onSubmit: noop,
  onHear: noop,
  onContinue: noop
};

describe('instructions at the change of exercise', () => {
  it('introduces the choice format before playback and keeps routine feedback about the sound', () => {
    const renderChoice = (phase: 'ready' | 'answering' | 'feedback', scored: boolean) =>
      render(RecognitionPrompt, { props: { ...props, phase, scored, introduceFormat: true } }).body;
    expect(renderChoice('ready', false)).toContain('Warm-ups are unscored');
    expect(renderChoice('ready', true)).toContain('counts toward the course requirements');
    expect(renderChoice('answering', false)).not.toContain('Warm-ups are unscored');
    expect(renderChoice('feedback', true)).toContain('Answered in 1.2 s.');
    expect(renderChoice('feedback', false)).not.toContain('Answered in');
  });

  it('teaches typed recall and groups before playback without revealing an answer', () => {
    for (const [expected, cue] of [
      ['K', 'Type one character to submit.'],
      ['KM', 'Listen for 2 characters.']
    ]) {
      const options = {
        ...props,
        expected,
        typed: true,
        scored: true,
        firstRecall: expected.length === 1,
        phase: 'ready' as const
      };
      const introduction = render(RecognitionPrompt, {
        props: { ...options, introduceFormat: true }
      }).body;
      expect(introduction).toContain(cue);
      expect(introduction).not.toContain(`>${expected}<`);
      const routine = render(RecognitionPrompt, { props: options }).body;
      expect(routine).not.toContain(cue);
    }
  });

  it('gives coaching misses two labeled playable sounds without repeating the round policy', () => {
    const options = {
      ...props,
      entered: 'M',
      isCorrect: false,
      coaching: true,
      scored: false,
      phase: 'feedback' as const
    };
    const miss = render(RecognitionPrompt, { props: options }).body;
    expect(miss).toContain('Your answer · M');
    expect(miss).toContain('Correct sound · K');
    expect(miss.match(/aria-describedby="[^"]+-hear-sound"/g)).toHaveLength(2);
    expect(miss).toContain('Play sound');
    expect(miss).not.toMatch(/milestone|review interval|Compare the sounds/);
    const unsupported = render(RecognitionPrompt, { props: { ...options, entered: '~' } }).body;
    expect(unsupported).toContain('Your answer · ~');
    expect(unsupported.match(/aria-describedby="[^"]+-hear-sound"/g)).toHaveLength(1);
  });
});

it('keeps a mixed check sound-first and places the response before the replay decision', () => {
  const check = { ...props, typed: true, scored: true, assessment: true };
  const playing = render(RecognitionPrompt, { props: { ...check, phase: 'playing' } }).body;
  expect(playing).toContain('Playing sound…');
  expect(playing).not.toMatch(/role="status"|aria-live/);
  expect(playing).not.toMatch(/Type your answer|Press Space|aria-keyshortcuts="Space"|<input|>K</);
  const answering = render(RecognitionPrompt, { props: { ...check, phase: 'answering' } }).body;
  expect(answering.indexOf('<input')).toBeLessThan(answering.indexOf('Replay sound'));
  expect(answering).toContain('Replaying uses this sound’s first-listen credit');
  expect(answering).not.toContain('Playing sound…');
  const replayed = render(RecognitionPrompt, {
    props: { ...check, phase: 'answering', replayed: true }
  }).body;
  expect(replayed).toContain('Replayed · no first-listen credit for this sound');
});

it('gives the group length before a restored practice sound without promising a scored answer', () => {
  const { body } = render(RecognitionPrompt, {
    props: {
      ...props,
      phase: 'ready',
      expected: 'KM',
      typed: true,
      scored: false,
      restoredUnscored: true,
      introduceFormat: true
    }
  });
  expect(body).toContain('Listen for 2 characters');
  expect(body).toContain('This saved prompt is for practice.');
  expect(body).not.toMatch(/counts once toward this session|>KM</);
});

it('explains an interrupted first recall without labeling it as scored or as a warm-up', () => {
  const markup = render(RecognitionPrompt, {
    props: {
      ...props,
      typed: true,
      firstRecall: true,
      phase: 'answering',
      scored: false,
      restoredUnscored: true
    }
  }).body;
  expect(markup).toContain('This saved prompt is for practice.');
  expect(markup).not.toMatch(/Scoring starts here|warm-up/);
});

it('labels a saved lesson using its curriculum characters without exposing the next pair', async () => {
  const { default: SavedSessions } = await import('./SavedSessions.svelte');
  const { createGuidedSession } = await import('../../training/v2/guided-session');
  const date = '2026-10-27T00:00:00Z';
  const id = 'saved';
  const prompt = {
    id: 'group',
    ordinal: 1,
    isScored: true,
    spec: {
      kind: 'short-group' as const,
      expectedText: 'KM',
      characters: ['K', 'M'],
      charWpm: 20,
      effWpm: 12,
      freqHz: 600
    }
  };
  const state = createGuidedSession({ sessionId: id, step: 2, prompts: [prompt] });
  const { body } = render(SavedSessions, {
    props: {
      entries: [
        {
          version: 1,
          kind: 'guided',
          id,
          href: '/morse/learn/session?step=2',
          savedAt: date,
          draft: '',
          state,
          record: {
            schemaVersion: 1,
            id,
            step: 2,
            charWpm: 20,
            effWpm: 12,
            freqHz: 600,
            startedAt: date,
            status: 'in-progress',
            promptCount: 1,
            completedPromptCount: 0
          },
          review: null,
          mixed: null,
          first: null
        }
      ],
      onDiscard: noop
    }
  });
  expect(body).toContain('Lesson 2: R');
  expect(body).not.toContain('K, M');
});
