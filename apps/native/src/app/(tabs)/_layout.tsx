import { NativeTabs } from "expo-router/unstable-native-tabs";
import { Header } from "@/components/Header";
import { i18n } from "@/lib/i18n";

export default function TabLayout() {
  return (
    <>
      <Header />
      <NativeTabs>
        <NativeTabs.Trigger name="index">
          <NativeTabs.Trigger.Label>
            {i18n.t("tabs.home")}
          </NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon
            sf={{ default: "house", selected: "house.fill" }}
            md="home"
          />
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="schedule">
          <NativeTabs.Trigger.Label>
            {i18n.t("tabs.schedule")}
          </NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon
            sf={{ default: "calendar", selected: "calendar.circle.fill" }}
            md="event"
          />
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="standings">
          <NativeTabs.Trigger.Label>
            {i18n.t("tabs.standings")}
          </NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon
            sf={{ default: "trophy", selected: "trophy.fill" }}
            md="emoji_events"
          />
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="teams">
          <NativeTabs.Trigger.Label>
            {i18n.t("tabs.teams")}
          </NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon
            sf={{ default: "person.2", selected: "person.2.fill" }}
            md="groups"
          />
        </NativeTabs.Trigger>
      </NativeTabs>
    </>
  );
}
