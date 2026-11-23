/**
 * Shared accuracy thresholds. These drive the result overlay, the lesson
 * progression buttons and the history badges, so they live in one place.
 */
export const SCORE_GOOD = 0.9;
export const SCORE_OK = 0.7;

export type ScoreGrade = 'good' | 'ok' | 'bad';

/** Upper-case and collapse whitespace; matching follows the same rules as passage scoring. */
function normalizeText(text: string): string {
  return text.toUpperCase().trim().replace(/\s+/g, ' ');
}

export function scoreGrade(accuracy: number): ScoreGrade {
  if (accuracy >= SCORE_GOOD) return 'good';
  if (accuracy >= SCORE_OK) return 'ok';
  return 'bad';
}

export interface DiffToken {
  ref: string;
  inp: string;
  type: 'correct' | 'substitution' | 'missing' | 'extra';
}

export interface PassageComparison {
  accuracy: number;
  differences: number;
  /** Some displayed symbols occupy multiple units in the stored passage score. */
  usesUnicodeUnits?: true;
  /** Each group follows the spacing in the source. An erroneous space is shown explicitly. */
  groups: DiffToken[][];
}

function costs(reference: string[], input: string[]): number[] {
  let previous = Array.from({ length: input.length + 1 }, (_, i) => i);
  let next = new Array<number>(input.length + 1);
  for (let i = 1; i <= reference.length; i++) {
    next[0] = i;
    for (let j = 1; j <= input.length; j++) {
      next[j] =
        reference[i - 1] === input[j - 1]
          ? previous[j - 1]
          : 1 + Math.min(previous[j - 1], previous[j], next[j - 1]);
    }
    [previous, next] = [next, previous];
  }
  return previous;
}

/** Hirschberg traceback: find where a minimum-edit alignment crosses the middle source row.
 * Using two distance rows rather than a full matrix also supports long restored drafts. */
function splitInput(left: string[], right: string[], input: string[]): number {
  const forward = costs(left, input);
  const backward = costs(right.slice().reverse(), input.slice().reverse());
  // Prefer the same relative position when several alignments cost the same.
  const middle = (left.length / (left.length + right.length)) * input.length;
  let split = 0;
  let lowest = Infinity;
  for (let j = 0; j <= input.length; j++) {
    const total = forward[j] + backward[input.length - j];
    if (total < lowest || (total === lowest && Math.abs(j - middle) < Math.abs(split - middle))) {
      lowest = total;
      split = j;
    }
  }
  return split;
}

type EmitCharacter = (sent: string, copied: string) => void;

function align(reference: string[], input: string[], emit: EmitCharacter): void {
  let start = 0;
  while (start < reference.length && start < input.length && reference[start] === input[start]) {
    emit(reference[start], input[start]);
    start++;
  }
  let r = reference.length,
    i = input.length;
  while (r > start && i > start && reference[r - 1] === input[i - 1]) {
    r--;
    i--;
  }

  if (r === start) {
    for (let j = start; j < i; j++) emit('', input[j]);
  } else if (i === start) {
    for (let j = start; j < r; j++) emit(reference[j], '');
  } else if (r === start + 1) {
    const match = input.slice(start, i).indexOf(reference[start]);
    const pair = start + Math.max(0, match);
    for (let j = start; j < i; j++) emit(j === pair ? reference[start] : '', input[j]);
  } else {
    const middle = start + Math.floor((r - start) / 2);
    const left = reference.slice(start, middle),
      right = reference.slice(middle, r);
    const copy = input.slice(start, i);
    const split = splitInput(left, right, copy);
    align(left, copy.slice(0, split), emit);
    align(right, copy.slice(split), emit);
  }
  for (let j = r; j < reference.length; j++) emit(reference[j], reference[j]);
}

function displaySymbols(text: string): string[] {
  if (/^[ -~]*$/.test(text) || typeof Intl.Segmenter !== 'function') return Array.from(text);
  const symbols = new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text);
  return Array.from(symbols, (symbol) => symbol.segment);
}

/** Keep the practice-copy-v1 score while showing edits to whole visible symbols. */
export function comparePassage(reference: string, input: string): PassageComparison {
  const sent = normalizeText(reference);
  const copied = normalizeText(input);
  const sentSymbols = displaySymbols(sent);
  const copiedSymbols = displaySymbols(copied);
  const usesUnicodeUnits =
    sent.length !== sentSymbols.length || copied.length !== copiedSymbols.length;
  const groups: DiffToken[][] = [];
  let group: DiffToken[] = [];
  let differences = 0;
  align(sentSymbols, copiedSymbols, (ref, inp) => {
    const type = ref === inp ? 'correct' : !ref ? 'extra' : !inp ? 'missing' : 'substitution';
    if (type !== 'correct') differences++;
    if (ref !== ' ' || type !== 'correct') {
      const previous = group.at(-1);
      if (type === 'correct' && previous?.type === 'correct') {
        previous.ref += ref;
        previous.inp += inp;
      } else {
        group.push({ type, ref, inp });
      }
    }
    if (ref === ' ') {
      groups.push(group);
      group = [];
    }
  });
  if (group.length) groups.push(group);
  // Persisted scores use UTF-16 edit distance, including when two different
  // emoji share a surrogate. Only the visible alignment uses graphemes.
  if (usesUnicodeUnits) {
    differences = 0;
    align(sent.split(''), copied.split(''), (ref, inp) => {
      if (ref !== inp) differences++;
    });
  }
  return {
    groups,
    differences,
    accuracy: Math.max(0, 1 - differences / sent.length),
    ...(usesUnicodeUnits && { usesUnicodeUnits })
  };
}

export function score(reference: string, input: string): number {
  return comparePassage(reference, input).accuracy;
}
