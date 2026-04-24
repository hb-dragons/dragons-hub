import { useEffect } from "react";
import { NativeTabs } from "expo-router/unstable-native-tabs";
import { useRouter, useSegments } from "expo-router";
import { canViewOpenGames } from "@dragons/shared";
import { useTheme } from "@/hooks/useTheme";
import { authClient } from "@/lib/auth-client";
import { i18n } from "@/lib/i18n";

export default function TabLayout() {
  const { colors } = useTheme();
  const { data: session } = authClient.useSession();
  const user = session?.user;
  const canRef = canViewOpenGames(
    user as { role?: string | null; refereeId?: number | null } | null | undefined,
  );

  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    const lastSegment: string = segments[segments.length - 1] ?? "";
    if (!canRef && lastSegment === "referee") {
      router.replace("/");
    }
  }, [canRef, segments, router]);

  return (
    <NativeTabs tintColor={colors.primary}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>{i18n.t("tabs.home")}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: "basketball", selected: "basketball.fill" }}
          md="sports_basketball"
        />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="schedule">
        <NativeTabs.Trigger.Label>{i18n.t("tabs.schedule")}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: "calendar", selected: "calendar" }}
          md="event"
        />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="standings">
        <NativeTabs.Trigger.Label>{i18n.t("tabs.standings")}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: "chart.bar", selected: "chart.bar.fill" }}
          md="leaderboard"
        />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="teams">
        <NativeTabs.Trigger.Label>{i18n.t("tabs.teams")}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: "person.3", selected: "person.3.fill" }}
          md="groups"
        />
      </NativeTabs.Trigger>
      {canRef ? (
        <NativeTabs.Trigger name="referee">
          <NativeTabs.Trigger.Label>{i18n.t("tabs.referee")}</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon
            sf={{ default: "person.badge.shield.checkmark", selected: "person.badge.shield.checkmark.fill" }}
            md="sports"
          />
        </NativeTabs.Trigger>
      ) : null}
    </NativeTabs>
  );
}
