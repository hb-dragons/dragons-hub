import type { GateUser, TodayItem } from "@dragons/shared";
import type { RouteHref } from "@/lib/nav/href";

/**
 * A `TodayItem` whose route is a typed href rather than any string, so a
 * provider naming a screen the app does not have fails typecheck where the
 * item is built instead of dead-ending on `+not-found` when someone taps it.
 */
export interface NativeTodayItem extends Omit<TodayItem, "route"> {
  route: RouteHref;
}

export interface TodayProvider {
  id: string;
  /** Whether this provider runs for the given user. */
  visible: (user: GateUser) => boolean;
  /**
   * Hook that returns this provider's items. MUST be called unconditionally
   * (React rules of hooks); it gates its own data fetch on `visible(user)`.
   */
  useItems: (user: GateUser) => NativeTodayItem[];
}
