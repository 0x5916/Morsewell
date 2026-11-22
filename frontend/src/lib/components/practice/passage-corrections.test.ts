import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import ResultOverlay from '../ResultOverlay.svelte';
import { comparePassage } from '../../score';
import { passageCorrections } from './passage-corrections';

function rows(sent: string, typed: string) {
  return passageCorrections(comparePassage(sent, typed).groups);
}

describe('passage correction display', () => {
  it('leaves exact matches in the source disclosure', () => {
    expect(rows('KM MM', 'km   mm')).toEqual([]);
  });

  it('retains the original aligned tokens only in groups with errors', () => {
    const { groups } = comparePassage('KMMMM R MMMKK', 'KMMMK R MMMKM');
    expect(passageCorrections(groups)).toEqual([
      { kind: 'group', tokens: groups[0] },
      { kind: 'group', tokens: groups[2] }
    ]);
  });

  it('folds a long missing stretch across group boundaries and counts missing spaces', () => {
    const result = rows('K MMMM TTTT R', 'K R');
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ kind: 'omission', count: 10 });
    if (result[0].kind === 'omission') {
      expect(
        result[0].groups
          .flat()
          .map((token) => token.ref)
          .join('')
      ).toBe('MMMM TTTT ');
    }
  });

  it('folds a long missing stretch inside a group while keeping neighboring mistakes', () => {
    const result = rows('ABKMMMMMMMMMMCD', 'AXKCD');
    expect(result[0]).toMatchObject({ kind: 'group' });
    expect(result[1]).toMatchObject({ kind: 'omission', count: 10 });
  });

  it('keeps a short omission and an extra space readable inline', () => {
    expect(rows('KMM', 'K')).toMatchObject([{ kind: 'group' }]);
    expect(rows('KMM', 'K MM')).toMatchObject([
      {
        kind: 'group',
        tokens: [{ type: 'correct' }, { type: 'extra', inp: ' ' }, { type: 'correct' }]
      }
    ]);
  });

  it('labels the orphaned half of a length-limited draft visually and for screen readers', () => {
    const comparison = comparePassage('KM', 'KMK\ud83e');
    const { body } = render(ResultOverlay, {
      props: {
        result: comparison.accuracy,
        comparison,
        lessonNum: 1,
        sourceText: 'KM',
        onClose() {},
        onRegenerate() {},
        onFinish() {},
        fallbackFocus: null
      }
    });
    expect(body).toContain('aria-label="Extra: Incomplete character"');
    expect(body).toMatch(/>Incomplete character</);
    expect(body).not.toMatch(/\p{Surrogate}/u);
  });
});
