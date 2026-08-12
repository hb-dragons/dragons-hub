import type { TabId } from "@dragons/shared";
import type { AppTab, AppTabsMinimizeBehavior } from "@/components/nav/AppTabs";

/**
 * A tab as declared here, i.e. an `AppTab` whose label is still a translation
 * key — `(tabs)/_layout.tsx` resolves it against the active locale.
 */
export interface TabConfig extends Omit<AppTab, "label"> {
  labelKey: string;
}

/**
 * Where the Staff standings entry point sends the user.
 *
 * Not `/standings`: native tabs build the navigator from the triggers that
 * render, so `(tabs)/standings` does not exist for a user whose Officiating tab
 * took its slot — exactly the user this shortcut is for. This route lives
 * outside the tab group and is pushed onto the root stack instead.
 */
export const STANDINGS_SHORTCUT_ROUTE = "/league-tables";

/**
 * Whether the tab bar minimizes while the user scrolls (iOS 26+).
 *
 * Evaluated per tab root, as #216 asks: Schedule, Standings and Officiating
 * are long lists that routinely run several screens deep, Teams runs about
 * two, and Today's item list can. Home is the one root that usually fits, and
 * it loses nothing by having the bar minimize on the rare long day. So the
 * answer is the same everywhere, which is just as well — UIKit hangs
 * `minimizeBehavior` off the tab bar *controller*, not off an individual tab,
 * so there is one value for the whole bar regardless.
 *
 * "onScrollDown" — minimize while reading further into content, expand on the
 * way back up — rather than "automatic", which resolves to no minimizing on
 * current iOS.
 */
export const TAB_BAR_MINIMIZE_BEHAVIOR: AppTabsMinimizeBehavior = "onScrollDown";

export const TAB_CONFIG: Record<TabId, TabConfig> = {
  home: {
    name: "index",
    labelKey: "tabs.home",
    sf: { default: "basketball", selected: "basketball.fill" },
    md: "sports_basketball",
  },
  schedule: {
    name: "schedule",
    labelKey: "tabs.schedule",
    sf: { default: "calendar", selected: "calendar" },
    md: "event",
  },
  standings: {
    name: "standings",
    labelKey: "tabs.standings",
    sf: { default: "chart.bar", selected: "chart.bar.fill" },
    md: "leaderboard",
  },
  teams: {
    name: "teams",
    labelKey: "tabs.teams",
    sf: { default: "person.3", selected: "person.3.fill" },
    md: "groups",
  },
  today: {
    name: "today",
    labelKey: "tabs.today",
    sf: { default: "bolt", selected: "bolt.fill" },
    md: "bolt",
  },
  officiating: {
    name: "officiating",
    labelKey: "tabs.officiating",
    sf: { default: "flag.2.crossed", selected: "flag.2.crossed.fill" },
    md: "sports",
  },
};
