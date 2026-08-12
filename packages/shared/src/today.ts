export interface TodayItem {
  /** Stable id, unique within a provider. */
  id: string;
  /** Provider that produced this item (used for tiebreak ordering). */
  providerId: string;
  title: string;
  subtitle?: string;
  /** Higher = more urgent; sorted descending. */
  urgency: number;
  /** expo-router path to navigate to on press. */
  route: string;
  /** Icon name resolved per platform. */
  icon: string;
}

/**
 * Generic over the item type so a platform can narrow `route` — the native app
 * carries a typed expo-router href there — without the ordering pass widening
 * it back to `TodayItem`.
 */
export function orderTodayItems<T extends TodayItem>(items: T[]): T[] {
  return [...items].sort(
    (a, b) =>
      b.urgency - a.urgency ||
      a.providerId.localeCompare(b.providerId) ||
      a.id.localeCompare(b.id),
  );
}
