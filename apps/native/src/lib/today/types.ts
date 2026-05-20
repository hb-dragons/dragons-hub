import type { GateUser, TodayItem } from "@dragons/shared";

export interface TodayProvider {
  id: string;
  /** Whether this provider runs for the given user. */
  visible: (user: GateUser) => boolean;
  /**
   * Hook that returns this provider's items. MUST be called unconditionally
   * (React rules of hooks); it gates its own data fetch on `visible(user)`.
   */
  useItems: (user: GateUser) => TodayItem[];
}
