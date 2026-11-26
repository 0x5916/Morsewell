import { describe, expect, it } from 'vitest';
import { latestOutsidePeriod } from './admin-period';

describe('latestOutsidePeriod', () => {
  const period = { until: '2026-11-24' };

  it('keeps completions before the exclusive Singapore boundary inside the period', () => {
    expect(latestOutsidePeriod('2026-11-23T15:57:03.033Z', period)).toBe(false);
    expect(latestOutsidePeriod('2026-11-23T15:59:59.999Z', period)).toBe(false);
  });

  it('reports completions on or after the Singapore midnight boundary as outside', () => {
    expect(latestOutsidePeriod('2026-11-23T16:00:00.000Z', period)).toBe(true);
    expect(latestOutsidePeriod('2026-11-23T16:16:00.000Z', period)).toBe(true);
  });

  it('treats missing or invalid timestamps as inside', () => {
    expect(latestOutsidePeriod(null, period)).toBe(false);
    expect(latestOutsidePeriod('not-a-date', period)).toBe(false);
  });
});
