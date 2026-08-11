import { selectTabs } from "@dragons/shared";
import { AppTabs } from "@/components/nav/AppTabs";
import { useTheme } from "@/hooks/useTheme";
import { useGateUser } from "@/lib/auth-client";
import { i18n } from "@/lib/i18n";
import { TAB_CONFIG } from "@/lib/nav/tabs";

export default function TabLayout() {
  const { colors } = useTheme();
  // Changing the visible trigger set on sign-in/out remounts the navigator and
  // resets tab state. That's fine here: auth transitions route to a fresh screen
  // (/today on sign-in, / on sign-out), so there's no in-tab state to preserve.
  const tabs = selectTabs(useGateUser()).map((tabId) => {
    const { labelKey, ...tab } = TAB_CONFIG[tabId];
    return { ...tab, label: i18n.t(labelKey) };
  });

  return <AppTabs tabs={tabs} tintColor={colors.primary} />;
}
