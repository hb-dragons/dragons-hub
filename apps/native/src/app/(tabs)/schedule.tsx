import { useState, useMemo, useRef, useCallback } from "react";
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

export default function ScheduleScreen() {
  const { colors, textStyles, spacing } = useTheme();
  const router = useRouter();
  const [locationFilter, setLocationFilter] = useState<LocationFilter>("all");
  const listRef = useRef<FlatList<MatchListItem>>(null);
  const hasScrolled = useRef(false);

  const { data, isLoading } = useSWR(
    "schedule:all",
    () => publicApi.getMatches({ limit: 1000, sort: "asc" }),
  );

  const allMatches = data?.items ?? [];

  const filtered = useMemo(() => {
    if (locationFilter === "home") return allMatches.filter((m) => m.homeIsOwnClub);
    if (locationFilter === "away") return allMatches.filter((m) => m.guestIsOwnClub);
    return allMatches;
  }, [allMatches, locationFilter]);

  // Index of the first upcoming game (no score yet, or date >= today)
  const firstUpcomingIndex = useMemo(() => {
    const today = new Date().toISOString().split("T")[0];
    const idx = filtered.findIndex((m) => m.kickoffDate >= today);
    return idx >= 0 ? idx : filtered.length - 1;
  }, [filtered]);

  const handleContentSizeChange = useCallback(() => {
    if (hasScrolled.current || filtered.length === 0 || firstUpcomingIndex <= 0) return;
    hasScrolled.current = true;

    listRef.current?.scrollToIndex({
      index: firstUpcomingIndex,
      animated: false,
      viewPosition: 0,
    });
  }, [filtered.length, firstUpcomingIndex]);

  const handleScrollToIndexFailed = useCallback((info: { index: number; averageItemLength: number }) => {
    // Fallback: estimate offset and scroll there
    listRef.current?.scrollToOffset({
      offset: info.index * info.averageItemLength,
      animated: false,
    });
  }, []);

  const handleFilterChange = useCallback((f: LocationFilter) => {
    hasScrolled.current = false;
    setLocationFilter(f);
  }, []);

  if (isLoading) {
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
          onPress={() => handleFilterChange(locationFilter === "home" ? "all" : "home")}
        />
        <FilterPill
          label={i18n.t("schedule.away")}
          active={locationFilter === "away"}
          onPress={() => handleFilterChange(locationFilter === "away" ? "all" : "away")}
        />
      </ScrollView>

      <FlatList
        ref={listRef}
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
        onContentSizeChange={handleContentSizeChange}
        onScrollToIndexFailed={handleScrollToIndexFailed}
        contentContainerStyle={{ paddingBottom: 100 }}
        initialNumToRender={filtered.length}
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
