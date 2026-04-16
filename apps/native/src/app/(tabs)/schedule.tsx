import { useState, useMemo, useCallback } from "react";
import { View, Text, FlatList, ScrollView, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import useSWR from "swr";
import type { MatchListItem } from "@dragons/shared";
import { useTheme } from "@/hooks/useTheme";
import { Screen } from "@/components/Screen";
import { SectionHeader } from "@/components/SectionHeader";
import { FilterPill } from "@/components/FilterPill";
import { MatchCardFull } from "@/components/MatchCardFull";
import { publicApi } from "@/lib/api";
import { i18n } from "@/lib/i18n";

type LocationFilter = "all" | "home" | "away";

function getToday(): string {
  return new Date().toISOString().split("T")[0];
}

export default function ScheduleScreen() {
  const { colors, textStyles, spacing } = useTheme();
  const router = useRouter();
  const [locationFilter, setLocationFilter] = useState<LocationFilter>("all");
  const [showPast, setShowPast] = useState(false);

  // Upcoming games (from today, ascending)
  const { data: upcomingData, isLoading: upcomingLoading } = useSWR(
    "schedule:upcoming",
    () => publicApi.getMatches({ limit: 1000, sort: "asc", dateFrom: getToday() }),
  );

  // Past games (before today, descending) — only fetched when user scrolls up
  const { data: pastData, isLoading: pastLoading } = useSWR(
    showPast ? "schedule:past" : null,
    () => publicApi.getMatches({ limit: 1000, sort: "desc", dateTo: getToday(), hasScore: true }),
  );

  const upcoming = upcomingData?.items ?? [];
  const past = pastData?.items ?? [];

  // Combine: past (reversed back to chronological asc) + upcoming
  const allMatches = useMemo(() => {
    const pastAsc = [...past].reverse();
    return [...pastAsc, ...upcoming];
  }, [past, upcoming]);

  const filtered = useMemo(() => {
    if (locationFilter === "home") return allMatches.filter((m) => m.homeIsOwnClub);
    if (locationFilter === "away") return allMatches.filter((m) => m.guestIsOwnClub);
    return allMatches;
  }, [allMatches, locationFilter]);

  const handleRefresh = useCallback(() => {
    if (!showPast) setShowPast(true);
  }, [showPast]);

  if (upcomingLoading) {
    return (
      <Screen>
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", paddingTop: spacing.xl }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll={false}>
      <SectionHeader title={i18n.t("schedule.title")} />

      {/* Filter pills */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0, marginBottom: spacing.md }}
      >
        <FilterPill
          label={i18n.t("schedule.homeOnly")}
          active={locationFilter === "home"}
          onPress={() => setLocationFilter(locationFilter === "home" ? "all" : "home")}
        />
        <FilterPill
          label={i18n.t("schedule.away")}
          active={locationFilter === "away"}
          onPress={() => setLocationFilter(locationFilter === "away" ? "all" : "away")}
        />
      </ScrollView>

      <FlatList
        data={filtered}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <View style={{ marginBottom: spacing.sm }}>
            <MatchCardFull
              match={item}
              onPress={() => router.push(`/game/${String(item.id)}`)}
            />
          </View>
        )}
        // Pull-to-refresh loads past games
        onRefresh={handleRefresh}
        refreshing={pastLoading}
        // Keep scroll position when past games prepend above
        maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
        contentContainerStyle={{ paddingBottom: 100 }}
        ListEmptyComponent={
          <View style={{ paddingTop: spacing.xl, alignItems: "center" }}>
            <Text style={[textStyles.body, { color: colors.mutedForeground }]}>
              {i18n.t("schedule.noMatches")}
            </Text>
          </View>
        }
        showsVerticalScrollIndicator={false}
      />
    </Screen>
  );
}
