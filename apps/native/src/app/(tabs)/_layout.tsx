import { NativeTabs } from "expo-router/unstable-native-tabs";
import { useTheme } from "@/hooks/useTheme";
import { i18n } from "@/lib/i18n";

export default function TabLayout() {
  const { colors } = useTheme();

  return (
    <NativeTabs tintColor={colors.primary}>
        <NativeTabs.Trigger name="index">
          <NativeTabs.Trigger.Label>
            {i18n.t("tabs.home")}
          </NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon
            sf={{ default: "basketball", selected: "basketball.fill" }}
            md="sports_basketball"
          />
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="schedule">
          <NativeTabs.Trigger.Label>
            {i18n.t("tabs.schedule")}
          </NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon
            sf={{ default: "calendar", selected: "calendar" }}
            md="event"
          />
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="standings">
          <NativeTabs.Trigger.Label>
            {i18n.t("tabs.standings")}
          </NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon
            sf={{ default: "chart.bar", selected: "chart.bar.fill" }}
            md="leaderboard"
          />
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="teams">
          <NativeTabs.Trigger.Label>
            {i18n.t("tabs.teams")}
          </NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon
            sf={{ default: "person.3", selected: "person.3.fill" }}
            md="groups"
          />
        </NativeTabs.Trigger>
      </NativeTabs>
  );
}
