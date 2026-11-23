import { LESSONS } from '../sequence';
import { reduceCharacterMasteries } from './mastery';
import type { AttemptEvent, CharacterMastery, ConfusionPair, HistorySessionRecord } from './types';

const DAY_MS = 86_400_000;

export interface ProgressSummary {
  masteryMap: Map<string, CharacterMastery>;
  confusionPairs: ConfusionPair[];
  slowChars: string[];
  sessionCount: number;
  guidedSessionCount: number;
  practiceSessionCount: number;
  legacySessionCount: number;
  timedSessionCount: number;
  totalMinutes: number | null;
  accuracyPercent: number | null;
  hasRecentActivity: boolean;
  hasPracticeHistory: boolean;
}

/** Native completion is the occurrence time until its server occurrence is downloaded. */
export function sessionOccurredAt(
  session: Pick<HistorySessionRecord, 'occurredAt' | 'completedAt' | 'startedAt'>
): string {
  return session.occurredAt ?? session.completedAt ?? session.startedAt ?? '';
}

export function recentConfusionPairs(recent: readonly AttemptEvent[]): ConfusionPair[] {
  const pairs = new Map<string, ConfusionPair>();
  for (const attempt of recent) {
    const expected = attempt.targetCharacter.toUpperCase();
    const actual = attempt.enteredText.toUpperCase();
    if (
      attempt.classification === 'unmeasured' ||
      attempt.isCorrect ||
      expected.length !== 1 ||
      actual.length !== 1 ||
      expected === actual
    ) {
      continue;
    }
    const key = JSON.stringify([expected, actual]);
    const existing = pairs.get(key);
    if (existing) {
      existing.confusionCount++;
      if (Date.parse(attempt.createdAt) > Date.parse(existing.lastOccurredAt)) {
        existing.lastOccurredAt = attempt.createdAt;
      }
    } else {
      pairs.set(key, { expected, actual, confusionCount: 1, lastOccurredAt: attempt.createdAt });
    }
  }

  return [...pairs.values()]
    .filter((pair) => pair.confusionCount >= 2)
    .sort(
      (a, b) =>
        b.confusionCount - a.confusionCount ||
        a.expected.localeCompare(b.expected) ||
        a.actual.localeCompare(b.actual)
    );
}

/** Server and older device records store a ratio rounded to three decimals.
 * Use the exact ratio for display when the underlying guided answers are present. */
export function historyWithAnswerAccuracy(
  sessions: readonly HistorySessionRecord[],
  attempts: readonly AttemptEvent[]
): HistorySessionRecord[] {
  const bySession = new Map(
    sessions.map((session) => [session.id, new Map<string, AttemptEvent>()])
  );
  for (const answer of attempts) bySession.get(answer.sessionId)?.set(answer.id, answer);
  return sessions.map((session) => {
    const answers = bySession.get(session.id);
    if (session.mode === 'practice' || session.mode === 'legacy' || !answers?.size) return session;
    if (session.eventIds) {
      if (
        session.eventIds.length !== answers.size ||
        !session.eventIds.every((id) => answers.has(id))
      )
        return session;
    }
    const scored = Array.from(answers.values()).filter(
      (answer) => answer.classification !== 'unmeasured'
    );
    if (!scored.length) return session;
    const accuracy = scored.filter((answer) => answer.isCorrect).length / scored.length;
    // Older guest rows have no manifest. A conflicting saved ratio can mean
    // the local answer history is incomplete, so keep that original result.
    if (
      !session.eventIds &&
      session.accuracy != null &&
      Math.abs(session.accuracy - accuracy) > 0.0005 + Number.EPSILON
    )
      return session;
    return { ...session, accuracy };
  });
}

/** Derives display metrics without storage, locale, or UI dependencies. */
export function summarizeProgress(
  attempts: readonly AttemptEvent[],
  sessions: readonly HistorySessionRecord[],
  nowIso: string
): ProgressSummary {
  const nowMs = Date.parse(nowIso);
  const recent = attempts.filter((attempt) => {
    const time = Date.parse(attempt.createdAt);
    return time >= nowMs - 60 * DAY_MS && time <= nowMs;
  });
  const scored7Days = recent.filter(
    (attempt) =>
      attempt.classification !== 'unmeasured' && Date.parse(attempt.createdAt) >= nowMs - 7 * DAY_MS
  );
  const completed = sessions.filter((session) => {
    const start = Date.parse(sessionOccurredAt(session));
    return session.status === 'completed' && start >= nowMs - 7 * DAY_MS && start <= nowMs;
  });
  let durationMs = 0;
  let timedSessionCount = 0;
  for (const session of completed) {
    const end = Date.parse(session.completedAt ?? '');
    const duration = end - Date.parse(session.startedAt ?? '');
    if (Number.isFinite(duration) && duration >= 0 && end <= nowMs) {
      durationMs += duration;
      timedSessionCount++;
    }
  }

  const masteryMap = reduceCharacterMasteries(LESSONS.join('').split(''), recent, { nowIso });
  const slowChars = [...masteryMap.values()]
    .filter(
      (mastery) =>
        mastery.totalAttempts >= 3 &&
        mastery.medianLatencyMs !== null &&
        mastery.medianLatencyMs > 2000
    )
    .map((mastery) => mastery.character);

  return {
    masteryMap,
    slowChars,
    confusionPairs: recentConfusionPairs(recent),
    sessionCount: completed.length,
    guidedSessionCount: completed.filter(
      (session) => session.mode !== 'practice' && session.mode !== 'legacy'
    ).length,
    practiceSessionCount: completed.filter((session) => session.mode === 'practice').length,
    legacySessionCount: completed.filter((session) => session.mode === 'legacy').length,
    timedSessionCount,
    totalMinutes:
      completed.length > 0 && timedSessionCount === 0
        ? null
        : Math.round((durationMs / 60_000) * 10) / 10,
    accuracyPercent: scored7Days.length
      ? Math.round(
          (scored7Days.filter((attempt) => attempt.isCorrect).length / scored7Days.length) * 100
        )
      : null,
    hasRecentActivity: recent.length > 0 || completed.length > 0,
    hasPracticeHistory: sessions.some(
      (session) => session.mode === 'practice' && session.status === 'completed'
    )
  };
}
