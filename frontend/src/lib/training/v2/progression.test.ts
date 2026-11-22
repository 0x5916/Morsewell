import { describe, expect, it } from 'vitest';
import { evaluateProgression } from './progression';
import { deriveGuidedLessonAccess } from './lesson-access';
import { reduceCharacterMastery } from './mastery';
import type { AttemptEvent } from './types';

function createMockAttempt(overrides: Partial<AttemptEvent> = {}): AttemptEvent {
  return {
    schemaVersion: 1,
    id: 'att_1',
    sessionId: 'sess_1',
    promptId: 'prm_1',
    promptKind: 'recall',
    targetCharacter: 'K',
    enteredText: 'K',
    isCorrect: true,
    classification: 'automatic',
    latencyMs: 1200,
    replayCount: 0,
    inputMode: 'keyboard',
    charWpm: 20,
    effWpm: 12,
    freqHz: 600,
    createdAt: '2026-10-04T12:00:00.000Z',
    ...overrides
  };
}

describe('Progression Decision Engine', () => {
  it('never unlocks course steps during free practice', () => {
    // 10/10 perfect scored attempts
    const attempts = Array.from({ length: 10 }, (_, i) =>
      createMockAttempt({ id: `att_${i}`, isCorrect: true })
    );

    const decision = evaluateProgression(1, attempts, [], { isFreePractice: true });

    expect(decision.canUnlock).toBe(false);
    expect(decision.action).toBe('continue');
    expect(decision.reasonCode).toBe('free_practice_excluded');
  });

  it('keeps an 80% session score separate from remaining character requirements', () => {
    // 8 correct, 2 wrong -> 80%
    const attempts = [
      ...Array.from({ length: 8 }, (_, i) => createMockAttempt({ id: `c_${i}`, isCorrect: true })),
      ...Array.from({ length: 2 }, (_, i) => createMockAttempt({ id: `w_${i}`, isCorrect: false }))
    ];

    const decision = evaluateProgression(1, attempts, []);

    expect(decision.canUnlock).toBe(false);
    expect(decision.action).toBe('continue');
    expect(decision.remainingMasteries.map((mastery) => mastery.character)).toEqual(['K', 'M']);
  });

  it('blocks unlock when an individual character is weak despite high aggregate accuracy', () => {
    // Step 1: K and M. 10 attempts total: 8 on K (100% correct), 2 on M (0% correct) -> overall 80%
    // Let's do 12 attempts total: 10 on K (100% correct), 2 on M (0% correct: 0/2 = 0%) -> overall 10/12 = 83.3%
    // Let's do 14 attempts: 12 on K (100%), 2 on M (1 correct, 1 wrong = 50% < 70%) -> overall 13/14 = 92.8%!
    const attempts = [
      ...Array.from({ length: 12 }, (_, i) =>
        createMockAttempt({ id: `k_${i}`, targetCharacter: 'K', enteredText: 'K', isCorrect: true })
      ),
      createMockAttempt({ id: 'm_1', targetCharacter: 'M', enteredText: 'M', isCorrect: true }),
      createMockAttempt({
        id: 'm_2',
        targetCharacter: 'M',
        enteredText: 'T',
        isCorrect: false,
        classification: 'incorrect'
      })
    ];

    // High overall accuracy: 13/14 = 92.9% > 90%
    const decision = evaluateProgression(1, attempts, []);

    expect(decision.canUnlock).toBe(false);
    expect(decision.action).toBe('continue');
    expect(decision.reasonCode).toBe('introduced_character_unstable');
    expect(decision.weakCharacters).toContain('M');
  });

  it('requires multi-session evidence to unlock the next character', () => {
    // 12 attempts in session 1 alone, 100% accurate
    const session1Attempts = Array.from({ length: 12 }, (_, i) =>
      createMockAttempt({
        id: `s1_${i}`,
        sessionId: 'sess_1',
        targetCharacter: i % 2 === 0 ? 'K' : 'M',
        enteredText: i % 2 === 0 ? 'K' : 'M',
        isCorrect: true
      })
    );

    // No prior sessions
    const decision = evaluateProgression(1, session1Attempts, []);

    expect(decision.canUnlock).toBe(false);
    expect(decision.remainingMasteries.every((mastery) => mastery.sessionCount === 1)).toBe(true);
  });

  it('blocks unlock when accurate multi-session answers remain too slow for mastery', () => {
    const makeSession = (sessionId: string, createdAt: string) =>
      Array.from({ length: 12 }, (_, i) =>
        createMockAttempt({
          id: `${sessionId}_${i}`,
          sessionId,
          targetCharacter: i % 2 === 0 ? 'K' : 'M',
          enteredText: i % 2 === 0 ? 'K' : 'M',
          classification: 'developing',
          latencyMs: 2400,
          createdAt
        })
      );
    const historicalAttempts = makeSession('sess_1', '2026-10-01T10:00:00.000Z');
    const sessionAttempts = makeSession('sess_2', '2026-10-02T10:00:00.000Z');
    const nowIso = '2026-10-02T11:00:00.000Z';

    for (const character of ['K', 'M']) {
      expect(
        reduceCharacterMastery(character, [...historicalAttempts, ...sessionAttempts], { nowIso })
      ).toMatchObject({
        totalAttempts: 12,
        sessionCount: 2,
        rollingAccuracy: 1,
        medianLatencyMs: 2400,
        status: 'learning'
      });
    }

    const decision = evaluateProgression(1, sessionAttempts, historicalAttempts, { nowIso });

    expect(decision.canUnlock).toBe(false);
    expect(decision.action).toBe('continue');
    expect(decision.reasonCode).toBe('introduced_character_unstable');
    expect(decision.weakCharacters).toContain('K');
  });

  it('unlocks next character when multi-session, accuracy, and individual stability pass', () => {
    // Historical session 1: 12 attempts on K/M (6 each)
    const histAttempts = Array.from({ length: 12 }, (_, i) =>
      createMockAttempt({
        id: `h_${i}`,
        sessionId: 'sess_1',
        targetCharacter: i % 2 === 0 ? 'K' : 'M',
        enteredText: i % 2 === 0 ? 'K' : 'M',
        isCorrect: true,
        createdAt: '2026-10-01T10:00:00.000Z'
      })
    );

    // Current session 2: 12 attempts on K/M (6 each)
    const session2Attempts = Array.from({ length: 12 }, (_, i) =>
      createMockAttempt({
        id: `s2_${i}`,
        sessionId: 'sess_2',
        targetCharacter: i % 2 === 0 ? 'K' : 'M',
        enteredText: i % 2 === 0 ? 'K' : 'M',
        isCorrect: true,
        createdAt: '2026-10-02T10:00:00.000Z'
      })
    );

    const decision = evaluateProgression(1, session2Attempts, histAttempts, {
      nowIso: '2026-10-02T11:00:00.000Z'
    });

    expect(decision.canUnlock).toBe(true);
    expect(decision.action).toBe('unlock-next');
    expect(decision.nextStep).toBe(2);
    expect(decision.unlockedCharacter).toBe('R');
  });
});

const now = '2026-10-04T12:00:00.000Z';
function singles(sessionId: string, characters: string) {
  return [...characters].map((character, index) =>
    createMockAttempt({
      id: sessionId + index,
      sessionId,
      targetCharacter: character,
      enteredText: character,
      createdAt: now
    })
  );
}

it('opens the same lesson as the route when the two missed groups lower the score to 9/11', () => {
  const history = [...singles('first', 'KMKMKMKMK'), ...singles('second', 'MKMKMKMKM')];
  const session = [
    ...singles('third', 'KMKMKMKMK'),
    ...['KM', 'MK'].map((group) =>
      createMockAttempt({
        id: group,
        sessionId: 'third',
        promptKind: 'short-group',
        targetCharacter: group,
        isCorrect: false,
        classification: 'incorrect'
      })
    )
  ];
  const result = evaluateProgression(1, session, history, { nowIso: now });
  expect(result.sessionAccuracy).toBeCloseTo(9 / 11, 3);
  expect(result.coaching).toEqual({ kind: 'accuracy' });
  expect(result.nextStep).toBe(2);
  expect(deriveGuidedLessonAccess([...history, ...session], now).unlockedStep).toBe(
    result.nextStep
  );
});

it('deduplicates a resumed session and reports the two actual remaining character requirements', () => {
  const first = singles('first', 'KMKMKMKMK');
  const second = singles('second', 'KMKMKMKMK');
  const historyAtResume = [...first, ...second.slice(0, 8)];
  const result = evaluateProgression(1, second, historyAtResume, { nowIso: now });
  expect(result.canUnlock).toBe(false);
  expect(
    result.remainingMasteries.map((mastery) => [mastery.character, mastery.totalAttempts])
  ).toEqual([
    ['K', 10],
    ['M', 8]
  ]);
  expect(deriveGuidedLessonAccess([...first, ...second], now).unlockedStep).toBe(1);
});

it('keeps an already open lesson available while recommending a weak sound from this session', () => {
  const history = [...singles('first', 'KM'.repeat(6)), ...singles('second', 'KM'.repeat(6))];
  const session = singles('third', 'K'.repeat(12) + 'MM');
  session.at(-1)!.isCorrect = false;
  const result = evaluateProgression(1, session, history, { nowIso: now });
  expect(result.coaching).toEqual({ kind: 'characters', characters: ['M'] });
  expect(result.nextStep).toBe(2);
});
