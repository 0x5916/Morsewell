import type { DiffToken } from '../../score';

type CorrectionRow =
  | { kind: 'group'; tokens: DiffToken[] }
  | { kind: 'omission'; groups: DiffToken[][]; count: number };

// Keep short misses beside their context. A full training group is at most seven characters.
const FOLD_AT = 8;

function* splitLongOmissions(group: DiffToken[]): Generator<DiffToken[]> {
  let start = 0;
  for (let cursor = 0; cursor < group.length;) {
    if (group[cursor].type !== 'missing') {
      cursor++;
      continue;
    }
    const firstMissing = cursor;
    while (cursor < group.length && group[cursor].type === 'missing') cursor++;
    if (cursor - firstMissing < FOLD_AT) continue;
    if (firstMissing > start) yield group.slice(start, firstMissing);
    yield group.slice(firstMissing, cursor);
    start = cursor;
  }
  if (start < group.length) yield start === 0 ? group : group.slice(start);
}

/** Keep edited characters in their source group and fold long stretches with no copied text. */
export function passageCorrections(groups: DiffToken[][]): CorrectionRow[] {
  const rows: CorrectionRow[] = [];
  let missingGroups: DiffToken[][] = [];
  let missingCount = 0;

  function finishOmissions() {
    if (missingCount >= FOLD_AT) {
      rows.push({ kind: 'omission', groups: missingGroups, count: missingCount });
    } else {
      for (const tokens of missingGroups) rows.push({ kind: 'group', tokens });
    }
    missingGroups = [];
    missingCount = 0;
  }

  for (const group of groups) {
    for (const tokens of splitLongOmissions(group)) {
      if (tokens.length && tokens.every((token) => token.type === 'missing')) {
        missingGroups.push(tokens);
        missingCount += tokens.length;
      } else {
        finishOmissions();
        if (tokens.some((token) => token.type !== 'correct')) rows.push({ kind: 'group', tokens });
      }
    }
  }
  finishOmissions();
  return rows;
}
