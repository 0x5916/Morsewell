import { describe, expect, it } from 'vitest';
import { reportHref } from './admin-report';

function paramsFor(href: string) {
  return new URL(href, 'https://morsewell.com').searchParams;
}

describe('admin report URL state', () => {
  it('keeps the implicit rolling period free of an until parameter', () => {
    for (const view of ['overview', 'users', 'compose', 'review', 'sent'] as const) {
      const params = paramsFor(reportHref(view, 30, ''));
      expect(params.get('view')).toBe(view);
      expect(params.get('days')).toBe('30');
      expect(params.has('until')).toBe(false);
    }
  });

  it('preserves an explicit historical until across views and ranges', () => {
    for (const view of ['overview', 'users', 'compose', 'review', 'sent'] as const) {
      for (const days of [7, 30, 90]) {
        expect(paramsFor(reportHref(view, days, '2026-11-23')).get('until')).toBe('2026-11-23');
      }
    }
  });

  it('keeps metric and learner navigation on the explicit historical period', () => {
    const params = paramsFor(reportHref('users', 30, '2026-11-23', 'duration_ms', 'learner-1'));
    expect(params.get('until')).toBe('2026-11-23');
    expect(params.get('metric')).toBe('duration_ms');
    expect(params.get('learner')).toBe('learner-1');
  });
});
