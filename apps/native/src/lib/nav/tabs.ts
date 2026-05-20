import type {
  MaterialIcon,
  SFSymbolIcon,
} from "expo-router/unstable-native-tabs";
import type { TabId } from "@dragons/shared";

/** SF Symbol object form expected by `<NativeTabs.Trigger.Icon sf={...} />`. */
type SfIcon = Extract<NonNullable<SFSymbolIcon["sf"]>, object>;

export interface TabConfig {
  /** expo-router route name within the (tabs) group. */
  name: string;
  labelKey: string;
  sf: SfIcon;
  md: MaterialIcon["md"];
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
  tools: {
    name: "tools",
    labelKey: "tabs.tools",
    sf: { default: "wrench.and.screwdriver", selected: "wrench.and.screwdriver.fill" },
    md: "build",
  },
};
