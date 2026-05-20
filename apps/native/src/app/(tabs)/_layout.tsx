import { NativeTabs } from "expo-router/unstable-native-tabs";
import { selectTabs } from "@dragons/shared";
import { useTheme } from "@/hooks/useTheme";
import { useGateUser } from "@/lib/auth-client";
import { i18n } from "@/lib/i18n";
import { TAB_CONFIG } from "@/lib/nav/tabs";

export default function TabLayout() {
  const { colors } = useTheme();
  // Changing the visible trigger set on sign-in/out remounts the navigator and
  // resets tab state. That's fine here: auth transitions route to a fresh screen
  // (/today on sign-in, / on sign-out), so there's no in-tab state to preserve.
  const tabs = selectTabs(useGateUser());

  return (
    <NativeTabs tintColor={colors.primary}>
      {tabs.map((tabId) => {
        const cfg = TAB_CONFIG[tabId];
        return (
          <NativeTabs.Trigger key={tabId} name={cfg.name}>
            <NativeTabs.Trigger.Label>{i18n.t(cfg.labelKey)}</NativeTabs.Trigger.Label>
            <NativeTabs.Trigger.Icon sf={cfg.sf} md={cfg.md} />
          </NativeTabs.Trigger>
        );
      })}
    </NativeTabs>
  );
}
