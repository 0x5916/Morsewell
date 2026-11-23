import * as m from '#lib/paraglide/messages.js';
import {
  learningRecommendationHref,
  returnScreeningTargets,
  type LearningCharacter
} from '#lib/data/learning-snapshot.ts';
import type { ConfusionPair } from '#lib/training/v2/types.ts';
import type { SessionCheckpoint } from '#lib/data/session-checkpoints.ts';
import { LESSONS } from '#lib/training/sequence.ts';
import type { Recommendation } from '#lib/training/learning-policy/recommendation.ts';
import {
  recommendationHint,
  savedSessionAction,
  isOptionalCheck,
  guidedRepeatHint,
  recommendationTitle
} from '#lib/components/learning/recommendation-copy.ts';
import { isRecommendationLessonLocked } from '#lib/training/v2/lesson-access.ts';

interface HomeLessonLink {
  title: string;
  hint: string;
  path: string;
}

interface HomeLessonInput {
  dashboard: {
    returning: boolean;
    savedSession?: SessionCheckpoint | null;
    summary?: { confusionPairs: ConfusionPair[] };
    unfinishedSession: { step: number } | null;
    guidance: {
      courseComplete: boolean;
      currentStep: number;
      unlockedStep: number;
      reviewChars: string[];
    };
  } | null;
  snapshot: {
    knownCharacters: string[];
    characters: readonly Pick<LearningCharacter, 'character' | 'proficiency' | 'lastAssessedAt'>[];
    coverage: 'complete' | 'local-only' | 'partial';
    profile: { charWpm: number };
    recommendation: { primary: Recommendation };
  } | null;
  recentReview: boolean;
}

/** Pick the strongest truthful next action for the returning Home dashboard. */
export function homeLessonLink({
  dashboard,
  snapshot,
  recentReview
}: HomeLessonInput): HomeLessonLink {
  const title = m.nav_learn();
  const path = '/morse/learn';
  if (!dashboard) return { title, hint: '', path };

  if (dashboard.savedSession) return savedSessionAction(dashboard.savedSession);
  const unfinished = dashboard.unfinishedSession;
  if (!unfinished && snapshot && snapshot.knownCharacters.length >= 2) {
    const primary = snapshot.recommendation.primary;
    if (
      !isOptionalCheck(primary) &&
      !isRecommendationLessonLocked(primary, dashboard.guidance.unlockedStep)
    ) {
      const destination = learningRecommendationHref(primary, snapshot.knownCharacters);
      if (destination.includes('check='))
        return {
          title: m.check_begin_explicit(),
          hint: m.check_home_hint({ characters: primary.targets.join(', ') }),
          path: destination
        };
      return {
        title: recommendationTitle(primary),
        hint:
          snapshot.coverage === 'partial'
            ? m.learning_coverage_partial()
            : recommendationHint(primary, snapshot.profile.charWpm),
        path: destination
      };
    }
  }
  if (
    dashboard.returning &&
    !unfinished &&
    !recentReview &&
    snapshot &&
    returnScreeningTargets(snapshot, null)?.length
  )
    return {
      title: m.review_return_title(),
      hint: m.review_return_hint(),
      path: '/morse/learn/session?review=return'
    };
  if (dashboard.guidance.courseComplete && !unfinished)
    return { title, hint: m.learn_complete_title(), path };

  const { currentStep, reviewChars } = dashboard.guidance;
  const step = unfinished?.step ?? currentStep;
  const characters = (LESSONS[step - 1] ?? '').split('').join(', ');
  return {
    title: unfinished
      ? m.home_lesson_title({ step, characters })
      : m.home_start_lesson_title({ step, characters }),
    hint: unfinished
      ? m.home_unfinished_hint()
      : guidedRepeatHint(dashboard.summary?.confusionPairs ?? [], step) ||
        (reviewChars.length ? m.learn_review_title({ characters: reviewChars.join(', ') }) : ''),
    path: unfinished ? path : `${path}/session?step=${step}`
  };
}
