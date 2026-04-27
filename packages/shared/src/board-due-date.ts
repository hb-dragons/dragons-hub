/**
 * Due-date urgency buckets for the native kanban board.
 *
 * Buckets:
 *   - overdue: dueDate's UTC day strictly before `now`'s UTC day
 *   - today:   same UTC calendar day as `now`
 *   - soon:    1..3 days out (UTC)
 *   - later:   >3 days out
 *
 * UTC is used deliberately so the bucket is stable across DST shifts and
 * matches the server's day arithmetic. The displayed "today/tomorrow"
 * labels are localised in the UI layer separately.
 */

export type DueDateBucket = "overdue" | "today" | "soon" | "later";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function utcDayStart(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export function dueDateBucket(
  dueIso: string | null,
  now: Date,
): DueDateBucket | null {
  if (dueIso == null) return null;
  const t = Date.parse(dueIso);
  if (Number.isNaN(t)) return null;

  const dueDay = utcDayStart(new Date(t));
  const nowDay = utcDayStart(now);

  if (dueDay < nowDay) return "overdue";
  if (dueDay === nowDay) return "today";

  const diffDays = Math.round((dueDay - nowDay) / MS_PER_DAY);
  if (diffDays >= 1 && diffDays <= 3) return "soon";
  return "later";
}
