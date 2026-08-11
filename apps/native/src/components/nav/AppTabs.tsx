import { NativeTabs } from "expo-router/unstable-native-tabs";
import type { MaterialIcon, SFSymbolIcon } from "expo-router/unstable-native-tabs";

/**
 * The app's tab bar, and the only module allowed to import
 * `expo-router/unstable-native-tabs` (ADR 0003, enforced by
 * `lib/nav/architecture.test.ts`).
 *
 * The API behind this file is alpha and expected to churn between SDK
 * releases. Everything upstream of it — the tab registry in `lib/nav/tabs.ts`,
 * the `(tabs)` layout — talks in terms of the plain `AppTab` shape below, so a
 * breaking change upstream is a change to this one file.
 */

/** SF Symbol object form expected by `<NativeTabs.Trigger.Icon sf={...} />`. */
export type AppTabSfIcon = Extract<NonNullable<SFSymbolIcon["sf"]>, object>;

/** Material icon name used as the Android fallback (ADR 0001). */
export type AppTabMaterialIcon = MaterialIcon["md"];

export interface AppTab {
  /** expo-router route name within the `(tabs)` group. */
  name: string;
  /** Already-translated label. */
  label: string;
  sf: AppTabSfIcon;
  md: AppTabMaterialIcon;
}

export interface AppTabsProps {
  tabs: AppTab[];
  tintColor: string;
}

export function AppTabs({ tabs, tintColor }: AppTabsProps) {
  return (
    <NativeTabs tintColor={tintColor}>
      {tabs.map((tab) => (
        <NativeTabs.Trigger key={tab.name} name={tab.name}>
          <NativeTabs.Trigger.Label>{tab.label}</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf={tab.sf} md={tab.md} />
        </NativeTabs.Trigger>
      ))}
    </NativeTabs>
  );
}
