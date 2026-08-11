import type { TabId } from "@dragons/shared";
import type { AppTab } from "@/components/nav/AppTabs";

/**
 * A tab as declared here, i.e. an `AppTab` whose label is still a translation
 * key — `(tabs)/_layout.tsx` resolves it against the active locale.
 */
export interface TabConfig extends Omit<AppTab, "label"> {
  labelKey: string;
}

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
