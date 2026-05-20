import { orderTodayItems, type GateUser, type TodayItem } from "@dragons/shared";
import type { TodayProvider } from "./types";
import { refereeProvider } from "./providers/referee";
import { clubProvider } from "./providers/club";

export const TODAY_PROVIDERS: TodayProvider[] = [refereeProvider, clubProvider];

/**
 * Aggregates every provider's items. All providers' hooks run unconditionally
 * (rules of hooks); each provider gates its own fetch on visibility, so hidden
 * providers cost nothing beyond an inert hook call.
 */
export function useTodayItems(user: GateUser): TodayItem[] {
  const all: TodayItem[] = [];
  for (const provider of TODAY_PROVIDERS) {
    // Order is stable because TODAY_PROVIDERS is a static module-level array.
    const items = provider.useItems(user);
    if (provider.visible(user)) all.push(...items);
  }
  return orderTodayItems(all);
}
