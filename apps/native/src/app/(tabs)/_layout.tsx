import { NativeTabs } from "expo-router/unstable-native-tabs";
import { selectTabs } from "@dragons/shared";
import { useTheme } from "@/hooks/useTheme";
import { authClient } from "@/lib/auth-client";
import { i18n } from "@/lib/i18n";
import { TAB_CONFIG } from "@/lib/nav/tabs";

export default function TabLayout() {
  const { colors } = useTheme();
  const { data: session } = authClient.useSession();
  const tabs = selectTabs(
    (session?.user ?? null) as
      | { role?: string | null; refereeId?: number | null }
      | null,
  );

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
