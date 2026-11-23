import { describe, expect, it } from 'vitest';
import * as m from '#lib/paraglide/messages.js';
import type { Recommendation } from '#lib/training/learning-policy/recommendation.ts';
import { homeLessonLink } from './home-lesson-link';

function dashboard(
  overrides: {
    returning?: boolean;
    unfinishedStep?: number | null;
    courseComplete?: boolean;
    currentStep?: number;
    unlockedStep?: number;
    reviewChars?: string[];
  } = {}
) {
  const {
    returning = false,
    unfinishedStep = null,
    courseComplete = false,
    currentStep = 1,
    unlockedStep = currentStep,
    reviewChars = []
  } = overrides;
  return {
    returning,
    unfinishedSession: unfinishedStep === null ? null : { step: unfinishedStep },
    guidance: { courseComplete, currentStep, unlockedStep, reviewChars }
  };
}

function snapshot(
  recommendation: Recommendation,
  knownCharacters = ['K', 'M', 'T'],
  coverage: 'complete' | 'local-only' | 'partial' = 'complete'
) {
  return {
    knownCharacters,
    characters: [],
    coverage,
    profile: { charWpm: 20 },
    recommendation: { primary: recommendation }
  };
}

describe('homeLessonLink', () => {
  it('falls back to the course when no dashboard is loaded', () => {
    expect(homeLessonLink({ dashboard: null, snapshot: null, recentReview: false })).toEqual({
      title: m.nav_learn(),
      hint: '',
      path: '/morse/learn'
    });
  });

  it('offers the saved lesson for an unfinished session', () => {
    expect(
      homeLessonLink({
        dashboard: dashboard({ unfinishedStep: 3 }),
        snapshot: null,
        recentReview: false
      })
    ).toEqual({
      title: m.home_lesson_title({ step: 3, characters: 'S' }),
      hint: m.home_unfinished_hint(),
      path: '/morse/learn'
    });
  });

  it('uses the prospective recommendation when the guided lesson is unlocked', () => {
    const link = homeLessonLink({
      dashboard: dashboard({ unlockedStep: 2 }),
      snapshot: snapshot({ reason: 'new-lesson', targets: ['M'], lesson: 2 }),
      recentReview: false
    });
    expect(link.path).toBe('/morse/learn/session?step=2');
    expect(link.title).toBe(m.learning_next_new({ step: 2, characters: 'M' }));
    expect(link.hint).toBe('');
  });

  it('does not link to a learning recommendation above the guided unlock', () => {
    const link = homeLessonLink({
      dashboard: dashboard({ currentStep: 1, unlockedStep: 1 }),
      snapshot: snapshot({ reason: 'new-lesson', targets: ['M'], lesson: 2 }),
      recentReview: false
    });
    expect(link.path).toBe('/morse/learn/session?step=1');
    expect(link.title).toBe(m.home_start_lesson_title({ step: 1, characters: 'K, M' }));
  });

  it.each(['calibrate', 'check-current'] as const)(
    'prioritizes guided practice over the optional %s assessment',
    (reason) => {
      const data = {
        ...dashboard(),
        summary: {
          confusionPairs: [
            { expected: 'M', actual: 'K', confusionCount: 3, lastOccurredAt: '2026-11-22' }
          ]
        }
      };
      expect(
        homeLessonLink({
          dashboard: data,
          snapshot: snapshot({ reason, targets: ['K', 'M'], lesson: null }),
          recentReview: false
        })
      ).toMatchObject({
        path: '/morse/learn/session?step=1',
        hint: m.guided_confusion_hint({ expected: 'M', actual: 'K', count: 3 })
      });
    }
  );

  it('offers a due check with its targets and credit rule', () => {
    expect(
      homeLessonLink({
        dashboard: dashboard(),
        snapshot: snapshot({ reason: 'due-check', targets: ['K'], lesson: null }),
        recentReview: false
      })
    ).toEqual({
      path: '/morse/learn/session?check=K',
      title: m.check_begin_explicit(),
      hint: m.check_home_hint({ characters: 'K' })
    });
  });

  it('marks partial coverage in the hint', () => {
    const link = homeLessonLink({
      dashboard: dashboard({ unlockedStep: 2 }),
      snapshot: snapshot(
        { reason: 'new-lesson', targets: ['M'], lesson: 2 },
        ['K', 'M'],
        'partial'
      ),
      recentReview: false
    });
    expect(link.hint).toBe(m.learning_coverage_partial());
  });

  it('does not offer a return round until compatible proficiency is available', () => {
    expect(
      homeLessonLink({
        dashboard: dashboard({ returning: true }),
        snapshot: null,
        recentReview: false
      }).path
    ).toBe('/morse/learn/session?step=1');
  });

  it('sends a qualified returning learner to a round with the assessed targets', () => {
    const link = homeLessonLink({
      dashboard: dashboard({ returning: true }),
      snapshot: snapshot({ reason: 'return-screening', targets: ['K'], lesson: null }),
      recentReview: false
    });
    expect(link.path).toBe('/morse/learn/session?review=return&targets=K');
    expect(link.title).toBe(m.learning_next_return());
  });

  it('explains the content chooser when recommending the Practice page', () => {
    const link = homeLessonLink({
      dashboard: dashboard(),
      snapshot: snapshot({
        reason: 'contextual-practice',
        targets: ['K', 'M', 'R', 'S'],
        lesson: null
      }),
      recentReview: false
    });
    expect(link).toEqual({
      title: m.learning_next_context(),
      hint: m.learning_context_hint(),
      path: '/morse/practice'
    });
  });

  it('does not repeat the return screening after a recent review', () => {
    expect(
      homeLessonLink({
        dashboard: dashboard({ returning: true }),
        snapshot: null,
        recentReview: true
      }).path
    ).toBe('/morse/learn/session?step=1');
  });

  it('acknowledges course completion without inventing a new lesson', () => {
    expect(
      homeLessonLink({
        dashboard: dashboard({ courseComplete: true, currentStep: 39 }),
        snapshot: null,
        recentReview: false
      })
    ).toMatchObject({ hint: m.learn_complete_title(), path: '/morse/learn' });
  });

  it('names a review due in the current guidance', () => {
    expect(
      homeLessonLink({
        dashboard: dashboard({ currentStep: 4, reviewChars: ['T'] }),
        snapshot: null,
        recentReview: false
      })
    ).toMatchObject({
      title: m.home_start_lesson_title({ step: 4, characters: 'U' }),
      hint: m.learn_review_title({ characters: 'T' }),
      path: '/morse/learn/session?step=4'
    });
  });
});
