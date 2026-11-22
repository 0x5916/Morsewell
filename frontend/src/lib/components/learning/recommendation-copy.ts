import type { Recommendation } from '../../training/learning-policy/recommendation';
import { LEARNING_POLICY } from '../../training/learning-policy/policy';
import type { ConfusionPair } from '../../training/v2/types';
import type { SessionCheckpoint } from '../../data/session-checkpoints';
import { getLessonChars } from '../../training/sequence';
import * as m from '#lib/paraglide/messages.js';

export function mixedCriteriaText(): string {
  return m.mixed_criteria({
    checks: LEARNING_POLICY.proficiencyChecks,
    correct: LEARNING_POLICY.successesPerCheck,
    total: LEARNING_POLICY.opportunitiesPerTarget,
    days: LEARNING_POLICY.freshnessMs / 86_400_000
  });
}

export function mixedGapText(): string {
  return m.mixed_gap_hint({
    hours: LEARNING_POLICY.coldGapMs / 3_600_000,
    days: LEARNING_POLICY.retentionSpanMs / 86_400_000
  });
}

/** An undated check stays available while the guided course leads. */
export function isOptionalCheck(value: Recommendation): boolean {
  return value.reason === 'calibrate' || value.reason === 'check-current';
}

export function guidedRepeatPair(pairs: readonly ConfusionPair[], step: number) {
  const pool = getLessonChars(step);
  return pairs.find((item) => pool.includes(item.expected) && pool.includes(item.actual));
}

export function confusionSummary(pair: ConfusionPair): string {
  return m.guided_confusion_hint({
    expected: pair.expected,
    actual: pair.actual,
    count: pair.confusionCount
  });
}

export function guidedRepeatHint(pairs: readonly ConfusionPair[], step: number): string {
  const pair = guidedRepeatPair(pairs, step);
  return pair ? confusionSummary(pair) : '';
}

export function savedSessionAction(entry: SessionCheckpoint) {
  if (entry.kind === 'copy')
    return { title: m.practice_continue_passage(), hint: '', path: '/morse/practice?resume=copy' };
  return {
    title: entry.mixed
      ? m.check_resume()
      : entry.review
        ? m.session_resume_coaching()
        : m.session_continue(),
    hint: m.session_position({
      current: entry.state.currentPromptIndex + 1,
      total: entry.state.prompts.length
    }),
    path:
      entry.href + (entry.href.includes('?') ? '&' : '?') + 'resume=' + encodeURIComponent(entry.id)
  };
}

export function recommendationHint(value: Recommendation, speed: number): string {
  switch (value.reason) {
    case 'contextual-practice':
      return m.learning_context_hint();
    case 'repair':
    case 'return-screening':
      return m.review_unmeasured();
    case 'calibrate':
    case 'check-current':
    case 'due-check':
      return m.learning_overview_profile({ speed });
    default:
      return '';
  }
}

/** Localized label for a character's current proficiency criterion. */
export function criterionLabel(criterion: string): string {
  switch (criterion) {
    case 'met':
      return m.learning_current_met();
    case 'not-met':
      return m.learning_current_notmet();
    default:
      return m.learning_current_stale();
  }
}

export function recommendationTitle(value: Recommendation): string {
  const characters = value.targets.join(', ');
  switch (value.reason) {
    case 'new-lesson':
      return m.learning_next_new({ step: value.lesson ?? 1, characters });
    case 'repair':
      return m.learning_next_repair({ characters });
    case 'due-check':
      return m.learning_next_due({ characters });
    case 'return-screening':
      return m.learning_next_return();
    case 'contextual-practice':
      return m.learning_next_context();
    case 'rest-or-adjust':
      return m.learning_next_adjust();
    case 'load-history':
      return m.learning_next_history();
    case 'recover-save':
    case 'recover-session':
      return m.learning_next_recover();
    default:
      return m.learning_next_calibrate();
  }
}
