/**
 * Learner reports cover complete Singapore days: `period.until` is the
 * exclusive end date at 00:00 Singapore time. A lifetime completion at or
 * after that boundary falls outside the selected period, so the period-scoped
 * session list cannot contain it.
 */
export function latestOutsidePeriod(
  lastCompletedAt: string | null,
  period: { until: string }
): boolean {
  if (!lastCompletedAt) return false;
  const completed = Date.parse(lastCompletedAt);
  const end = Date.parse(`${period.until}T00:00:00+08:00`);
  return Number.isFinite(completed) && Number.isFinite(end) && completed >= end;
}
