import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import { activeLearningProfile, projectLearningSnapshot } from '../../data/learning-snapshot';
import LearningOverview from './LearningOverview.svelte';

describe('mixed check entry', () => {
  it('keeps the check length and credit visible without a second rule disclosure on results', () => {
    const snapshot = projectLearningSnapshot([], {
      ownerKey: 'unclaimed',
      knownCharacters: ['K', 'M'],
      profile: activeLearningProfile(20)
    });
    const { body } = render(LearningOverview, { props: { snapshot, compact: true } });
    expect(body).toContain('20 prompts');
    expect(body).toContain('first listen');
    expect(body).not.toContain('<details');
  });

  it.each([
    { knownCharacters: ['K', 'M'], prompts: 20, extras: false },
    { knownCharacters: ['K', 'M', 'R'], prompts: 24, extras: true }
  ])(
    'explains the actual $prompts prompts for a K and M check',
    ({ knownCharacters, prompts, extras }) => {
      const snapshot = projectLearningSnapshot([], {
        ownerKey: 'unclaimed',
        knownCharacters,
        profile: activeLearningProfile(20)
      });
      const { body } = render(LearningOverview, { props: { snapshot } });
      expect(body).toContain(`${prompts} prompts`);
      expect(body.includes('4 extra prompts using other familiar sounds')).toBe(extras);
    }
  );
});

describe('character recall history', () => {
  it.each(['complete', 'partial'] as const)(
    'qualifies review readiness for %s account history',
    (coverage) => {
      const ownerKey = 'account:learner',
        profile = activeLearningProfile(20);
      const snapshot = projectLearningSnapshot([], {
        ownerKey,
        coverage,
        profile,
        knownCharacters: ['K', 'M']
      });
      const date = '2026-10-01T00:00:00.000Z';
      const review = {
        ownerKey,
        profileKey: snapshot.profileKey,
        character: 'K',
        dueAt: date,
        lastExposureAt: date,
        coldEligibleAt: date,
        actionableAt: date,
        ready: true,
        reason: 'due' as const
      };
      const { body } = render(LearningOverview, {
        props: {
          snapshot,
          details: true,
          progressView: 'characters',
          characterRecords: [{ ...snapshot.characters[0], review }]
        }
      });
      expect(body.includes('Ready for a spaced check')).toBe(coverage === 'complete');
      expect(body.includes('Last recorded listen to K')).toBe(coverage === 'complete');
    }
  );
  it.each([
    ['none', 'local-only', 'No mixed check yet at this speed'],
    ['stale', 'local-only', 'Last mixed check more than 14 days ago'],
    ['incomplete', 'local-only', 'Incomplete check history'],
    ['incomplete', 'partial', 'Waiting for complete check history']
  ] as const)('explains %s evidence under %s coverage', (freshness, coverage, label) => {
    const snapshot = projectLearningSnapshot([], {
      ownerKey: 'unclaimed',
      knownCharacters: ['K'],
      profile: activeLearningProfile(20),
      coverage
    });
    const character = snapshot.characters[0];
    const { body } = render(LearningOverview, {
      props: {
        snapshot,
        details: true,
        progressView: 'characters',
        characterRecords: [{ ...character, current: { ...character.current, freshness } }]
      }
    });
    expect(body).toContain(label);
    expect(body).toContain('Hear one more character');
    expect(body).not.toContain('session?check=K');
  });
});
