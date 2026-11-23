/** Historical course access and separate coaching for the session just finished. */
import { LESSONS, getLessonChars } from '../sequence';
import { deriveCourseGuidance } from './course-guidance';
import {
  DEFAULT_MASTERY_POLICY,
  type AttemptEvent,
  type CharacterMastery,
  type MasteryPolicy,
  type SessionCoaching
} from './types';

export type ProgressionAction = 'unlock-next' | 'review' | 'continue';

export type ProgressionReasonCode =
  | 'unlocked_next_character'
  | 'all_curriculum_completed'
  | 'free_practice_excluded'
  | 'overall_accuracy_too_low'
  | 'introduced_character_unstable'
  | 'weak_character_detected'
  | 'insufficient_attempts'
  | 'insufficient_sessions';

export interface ProgressionDecision {
  action: ProgressionAction;
  reasonCode: ProgressionReasonCode;
  currentStep: number;
  nextStep: number | null;
  unlockedCharacter?: string;
  weakCharacters: string[];
  remainingMasteries: CharacterMastery[];
  coaching: SessionCoaching | null;
  canUnlock: boolean;
  sessionAccuracy: number;
}

export interface EvaluateProgressionOptions {
  policy?: MasteryPolicy;
  isFreePractice?: boolean;
  nowIso?: string;
}

function sessionCoaching(
  currentStep: number,
  scored: AttemptEvent[],
  sessionAccuracy: number,
  masteryMap: ReadonlyMap<string, CharacterMastery>,
  policy: MasteryPolicy
): SessionCoaching | null {
  if (scored.length < 6) return { kind: 'more-answers' };
  if (sessionAccuracy < policy.targetAccuracy) return { kind: 'accuracy' };
  const characters = [...getLessonChars(currentStep)].filter((character) => {
    const singles = scored.filter((answer) => answer.targetCharacter.toUpperCase() === character);
    if (singles.length < 2) return masteryMap.get(character)?.status === 'review';
    return singles.filter((answer) => answer.isCorrect).length / singles.length < 0.7;
  });
  return characters.length ? { kind: 'characters', characters } : null;
}

/**
 * Evaluates progression criteria after a training session.
 */
export function evaluateProgression(
  currentStep: number,
  sessionAttempts: AttemptEvent[],
  allHistoricalAttempts: AttemptEvent[],
  options: EvaluateProgressionOptions = {}
): ProgressionDecision {
  const policy = options.policy ?? DEFAULT_MASTERY_POLICY;
  const isFreePractice = options.isFreePractice ?? false;
  const nowIso = options.nowIso ?? new Date().toISOString();

  const scoredSessionAttempts = sessionAttempts.filter((a) => a.classification !== 'unmeasured');

  const sessionTotal = scoredSessionAttempts.length;
  const sessionCorrect = scoredSessionAttempts.filter((a) => a.isCorrect).length;
  const sessionAccuracy =
    sessionTotal > 0 ? Math.round((sessionCorrect / sessionTotal) * 1000) / 1000 : 0;

  const base: ProgressionDecision = {
    action: 'continue',
    reasonCode: 'free_practice_excluded',
    currentStep,
    nextStep: null,
    weakCharacters: [],
    remainingMasteries: [],
    coaching: null,
    canUnlock: false,
    sessionAccuracy
  };
  if (isFreePractice) return base;

  // A resumed session's saved answers are already in the repository snapshot.
  const unique = new Map(allHistoricalAttempts.map((attempt) => [attempt.id, attempt]));
  for (const attempt of sessionAttempts) unique.set(attempt.id, attempt);
  const history = [...unique.values()];
  const since = Date.parse(nowIso) - 30 * 86400000;
  const recent = history.filter((attempt) => Date.parse(attempt.createdAt) >= since);
  const guidance = deriveCourseGuidance(recent, nowIso, LESSONS, { history, policy });
  base.coaching = sessionCoaching(
    currentStep,
    scoredSessionAttempts,
    sessionAccuracy,
    guidance.masteryMap,
    policy
  );
  if (currentStep < guidance.unlockedStep) {
    return {
      ...base,
      action: 'unlock-next',
      reasonCode: 'unlocked_next_character',
      canUnlock: true,
      nextStep: currentStep + 1,
      unlockedCharacter: LESSONS[currentStep]
    };
  }
  if (guidance.courseComplete && currentStep === LESSONS.length)
    return { ...base, reasonCode: 'all_curriculum_completed' };

  const remaining = guidance.remainingMasteries;
  return {
    ...base,
    reasonCode: 'introduced_character_unstable',
    weakCharacters: remaining.map((mastery) => mastery.character),
    remainingMasteries: remaining
  };
}

/** Use the same result fields for immediate session state and the final persisted history. */
export function sessionProgressionFields(decision: ProgressionDecision) {
  return {
    weakCharacters: decision.weakCharacters,
    remainingMasteries: decision.remainingMasteries,
    coaching: decision.coaching,
    unlockedNextStep: decision.canUnlock,
    progressionReasonCode: decision.reasonCode
  };
}
