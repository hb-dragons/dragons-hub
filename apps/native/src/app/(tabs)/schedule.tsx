import { useState, useMemo, useCallback } from "react";
import { View, Text, FlatList, ScrollView, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import useSWRInfinite from "swr/infinite";
import type { MatchListItem } from "@dragons/shared";
import { useTheme } from "@/hooks/useTheme";
import { Screen } from "@/components/Screen";
import { SectionHeader } from "@/components/SectionHeader";
import { FilterPill } from "@/components/FilterPill";
import { MatchCardFull } from "@/components/MatchCardFull";
import { publicApi } from "@/lib/api";
import { i18n } from "@/lib/i18n";

type Mode = "upcoming" | "results";
type LocationFilter = "all" | "home" | "away";

const PAGE_SIZE = 20;

function getToday(): string {
  return new Date().toISOString().split("T")[0];
}

export default function ScheduleScreen() {
  const { colors, textStyles, spacing } = useTheme();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("upcoming");
  const [locationFilter, setLocationFilter] = useState<LocationFilter>("all");

  const isUpcoming = mode === "upcoming";

  const { data, size, setSize, isLoading, isValidating } = useSWRInfinite(
    (pageIndex: number) => `schedule:${mode}:${locationFilter}:${String(pageIndex)}`,
    (key: string) => {
      const pageIndex = Number(key.split(":")[3]);
      const today = getToday();
      return publicApi.getMatches({
        limit: PAGE_SIZE,
        offset: pageIndex * PAGE_SIZE,
        ...(isUpcoming ? { dateFrom: today, sort: "asc" as const } : { dateTo: today, sort: "desc" as const, hasScore: true }),
      });
    },
  );

  const allMatches = useMemo(() => {
    if (!data) return [];
    return data.flatMap((page) => page.items);
  }, [data]);

  const filtered = useMemo(() => {
    if (locationFilter === "home") return allMatches.filter((m) => m.homeIsOwnClub);
    if (locationFilter === "away") return allMatches.filter((m) => m.guestIsOwnClub);
    return allMatches;
  }, [allMatches, locationFilter]);

  const hasMore = data ? data[data.length - 1]?.hasMore ?? false : false;
  const isLoadingMore = isValidating && !isLoading;

  const handleEndReached = useCallback(() => {
    if (!isValidating && hasMore) {
      void setSize(size + 1);
    }
  }, [isValidating, hasMore, setSize, size]);

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
          label={i18n.t("schedule.upcoming")}
          active={mode === "upcoming"}
          onPress={() => setMode("upcoming")}
        />
        <FilterPill
          label={i18n.t("schedule.results")}
          active={mode === "results"}
          onPress={() => setMode("results")}
        />
        <View style={{ width: spacing.md }} />
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
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.5}
        contentContainerStyle={{ paddingBottom: spacing.xl }}
        ListFooterComponent={
          isLoadingMore ? (
            <ActivityIndicator color={colors.primary} style={{ paddingVertical: spacing.lg }} />
          ) : null
        }
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
