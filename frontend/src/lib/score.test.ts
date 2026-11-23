import { describe, expect, it } from 'vitest';
import { SCORE_GOOD, SCORE_OK, comparePassage, score, scoreGrade } from '#lib/score.ts';

describe('scoreGrade', () => {
  it('maps accuracy to the shared grade thresholds', () => {
    expect(SCORE_GOOD).toBe(0.9);
    expect(SCORE_OK).toBe(0.7);
    expect(scoreGrade(1)).toBe('good');
    expect(scoreGrade(0.9)).toBe('good');
    expect(scoreGrade(0.89)).toBe('ok');
    expect(scoreGrade(0.7)).toBe('ok');
    expect(scoreGrade(0.69)).toBe('bad');
    expect(scoreGrade(0)).toBe('bad');
  });
});

describe('score (character error rate)', () => {
  it('returns 1 for an exact match, ignoring case', () => {
    expect(score('E K', 'e k')).toBe(1);
    expect(score('E K', 'E K')).toBe(1);
  });

  it('scores substitutions by edit distance over the reference', () => {
    // One of four characters changed -> 3/4 correct.
    expect(score('KMRU', 'KMRS')).toBeCloseTo(0.75, 10);
  });

  it('scores insertions by edit distance over the reference', () => {
    // One extra character in the input -> 1 edit over 3 reference characters.
    expect(score('KMR', 'KMSR')).toBeCloseTo(2 / 3, 10);
  });

  it('scores deletions by edit distance over the reference', () => {
    // One missing character from a four-character reference -> 3/4.
    expect(score('KMRU', 'KMU')).toBeCloseTo(0.75, 10);
  });

  it('normalizes case and whitespace before scoring', () => {
    expect(score('K M  R', 'k m r')).toBe(1);
    expect(score('  K M R  ', 'K M R')).toBe(1);
    expect(score('K M\nR', 'k  m\r\nr')).toBe(1);
  });

  it('scores empty input as 0 against a non-empty reference', () => {
    expect(score('K M R', '')).toBe(0);
    expect(score('K M R', '   ')).toBe(0);
  });

  it('never returns less than 0 for many wrong characters', () => {
    expect(score('KM', 'RU')).toBe(0);
  });
});

describe('passage corrections', () => {
  it('keeps two changed final letters in their original groups', () => {
    const comparison = comparePassage('KMMMM MMMKK', 'KMMMK MMMKM');
    expect(comparison.differences).toBe(2);
    expect(comparison.accuracy).toBeCloseTo(9 / 11);
    expect(comparison.groups).toEqual([
      [
        { type: 'correct', ref: 'KMMM', inp: 'KMMM' },
        { type: 'substitution', ref: 'M', inp: 'K' }
      ],
      [
        { type: 'correct', ref: 'MMMK', inp: 'MMMK' },
        { type: 'substitution', ref: 'K', inp: 'M' }
      ]
    ]);
  });

  it.each([
    ['A B', 'AB', 'missing', ' ', ''],
    ['AB', 'A B', 'extra', '', ' '],
    ['A B', 'AXB', 'substitution', ' ', 'X'],
    ['ABC', 'A C', 'substitution', 'B', ' '],
    ['K M', 'K MX', 'extra', '', 'X'],
    ['K MM', 'K M', 'missing', 'M', '']
  ])('counts and identifies a single edit in %s vs %s', (source, copy, type, ref, inp) => {
    const comparison = comparePassage(source, copy);
    expect(comparison.differences).toBe(1);
    expect(comparison.groups.flat().filter((token) => token.type !== 'correct')).toEqual([
      { type, ref, inp }
    ]);
    expect(comparison.accuracy).toBeCloseTo(1 - 1 / source.length);
    expect(comparison.groups).toHaveLength(source.split(' ').length);
  });

  it('preserves normalized group boundaries and reports a perfect copy', () => {
    expect(comparePassage('  AB  CD ', 'ab\ncd')).toEqual({
      accuracy: 1,
      differences: 0,
      groups: [
        [{ type: 'correct', ref: 'AB', inp: 'AB' }],
        [{ type: 'correct', ref: 'CD', inp: 'CD' }]
      ]
    });
  });

  it('prefers corresponding positions in an ambiguous transposition', () => {
    expect(comparePassage('KM', 'MK').groups[0].map((token) => token.type)).toEqual([
      'substitution',
      'substitution'
    ]);
  });

  it.each([
    ['KM', 'K🦊', 'M', '🦊', 2],
    ['🦊', '🦄', '🦊', '🦄', 1],
    ['👩🏾‍🚀M', '👨🏻‍🚀M', '👩🏾‍🚀', '👨🏻‍🚀', 2],
    ['KE\u0301', 'KE', 'E\u0301', 'E', 1],
    ['🇯🇵', '🇨🇳', '🇯🇵', '🇨🇳', 2]
  ] as const)(
    'shows whole symbols for %s versus %s and retains the stored edit distance',
    (sent, input, ref, inp, differences) => {
      const comparison = comparePassage(sent, input);
      expect(comparison.groups.flat().filter((token) => token.type !== 'correct')).toEqual([
        { type: 'substitution', ref, inp }
      ]);
      expect(comparison.usesUnicodeUnits).toBe(true);
      expect(comparison.differences).toBe(differences);
      expect(comparison.accuracy).toBe(Math.max(0, 1 - differences / sent.length));
    }
  );

  it('handles a localized error in a long restored passage', () => {
    const text = 'K'.repeat(9999);
    const result = comparePassage(text + 'M', text + 'K');
    expect(result.differences).toBe(1);
    expect(result.groups[0]).toHaveLength(2);
  });
});
