import { useMemo, useState, useCallback } from "react";
import type { ReactElement } from "react";
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import type { RefreshControlProps } from "react-native";
import type { MatchListItem } from "@dragons/shared";
import { useRouter } from "expo-router";
import useSWR from "swr";
import { useTheme } from "@/hooks/useTheme";
import { useRefresh } from "@/hooks/useRefresh";
import { Screen, UNDER_NATIVE_HEADER } from "@/components/Screen";
import { screenContentPadding } from "@/lib/ui/screen-padding";
import { FilterPill } from "@/components/FilterPill";
import { MatchCardSchedule } from "@/components/MatchCardSchedule";
import { publicApi } from "@/lib/api";
import { i18n } from "@/lib/i18n";
import { kickoffToday } from "@/lib/format/kickoff";
import { filterByLocation, type LocationFilter } from "@/lib/ui/match-card";
import { Segmented } from "@/components/ui/Segmented";

type Segment = "upcoming" | "results";

/* ── Match List (reusable for both segments) ── */
function MatchList({
  matches,
  isLoading,
  refreshControl,
  controls,
}: {
  matches: MatchListItem[];
  isLoading: boolean;
  refreshControl?: ReactElement<RefreshControlProps>;
  /**
   * Segment switcher and filters. They ride inside the list rather than
   * sitting above it so the list is the screen's first scroll view —
   * which is the one the native large title tracks and insets.
   */
  controls: ReactElement;
}) {
  const { colors, textStyles, spacing } = useTheme();
  const router = useRouter();

  // Stable handler: MatchCard* are memo-wrapped, and an inline arrow per call
  // site made that memo a no-op.
  const openMatch = useCallback(
    (match: MatchListItem) => {
      router.push(`/game/${String(match.id)}`);
    },
    [router],
  );

  // The native tab bar clears itself; this is the same padding `Screen` gives
  // every scroll view it owns, so the content under the large title starts at
  // the same place on every tab root.
  const listContentStyle = useMemo(
    () => screenContentPadding({ lg: spacing.lg, xl: spacing.xl }),
    [spacing.lg, spacing.xl],
  );

  return (
    // No day headers (#408): every card carries its own date, and a header per
    // day was a row of its own for what is often a single game.
    <FlatList
      data={matches}
      // This list is the screen's scroll view, so it is the one the native
      // header insets and the large title collapses against.
      contentInsetAdjustmentBehavior="automatic"
      ListHeaderComponent={controls}
      ListEmptyComponent={
        isLoading ? (
          <View style={{ alignItems: "center", paddingTop: spacing.xl }}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : (
          <View style={{ alignItems: "center", paddingTop: spacing["2xl"] }}>
            <Text style={[textStyles.body, { color: colors.mutedForeground }]}>
              {i18n.t("schedule.noMatches")}
            </Text>
          </View>
        )
      }
      keyExtractor={(item) => String(item.id)}
      renderItem={({ item }) => (
        <View style={{ marginBottom: spacing.sm }}>
          <MatchCardSchedule match={item} onPress={openMatch} />
        </View>
      )}
      refreshControl={refreshControl}
      contentContainerStyle={listContentStyle}
      showsVerticalScrollIndicator={false}
    />
  );
}

/* ── Main Screen ── */
export default function ScheduleScreen() {
  const { colors, spacing } = useTheme();
  const [segment, setSegment] = useState<Segment>("upcoming");
  const [locationFilter, setLocationFilter] = useState<LocationFilter>("all");

  // Only the visible segment fetches. Both queries pull up to 1000 matches, and
  // issuing them unconditionally doubled the payload on mount for a list the
  // user cannot see. SWR keeps the other segment's response cached, so
  // switching back renders from cache and merely revalidates.

  // Upcoming: from today, ascending
  const {
    data: upcomingData,
    isLoading: upcomingLoading,
    mutate: mutateUpcoming,
  } = useSWR(segment === "upcoming" ? "schedule:upcoming" : null, () =>
    publicApi.getMatches({ limit: 1000, sort: "asc", dateFrom: kickoffToday() }),
  );

  // Results: up to today, descending (most recent first)
  const {
    data: resultsData,
    isLoading: resultsLoading,
    mutate: mutateResults,
  } = useSWR(segment === "results" ? "schedule:results" : null, () =>
    publicApi.getMatches({ limit: 1000, sort: "desc", dateTo: kickoffToday(), hasScore: true }),
  );

  const upcomingRefresh = useRefresh(() => mutateUpcoming());
  const resultsRefresh = useRefresh(() => mutateResults());

  const upcomingRefreshControl = useMemo(
    () => (
      <RefreshControl
        refreshing={upcomingRefresh.refreshing}
        onRefresh={() => {
          void upcomingRefresh.onRefresh();
        }}
        tintColor={colors.primary}
      />
    ),
    [upcomingRefresh.refreshing, upcomingRefresh.onRefresh, colors.primary],
  );

  const resultsRefreshControl = useMemo(
    () => (
      <RefreshControl
        refreshing={resultsRefresh.refreshing}
        onRefresh={() => {
          void resultsRefresh.onRefresh();
        }}
        tintColor={colors.primary}
      />
    ),
    [resultsRefresh.refreshing, resultsRefresh.onRefresh, colors.primary],
  );

  const upcoming = upcomingData?.items ?? [];
  const results = resultsData?.items ?? [];

  const upcomingMatches = useMemo(
    () => filterByLocation(upcoming, locationFilter),
    [upcoming, locationFilter],
  );

  const resultMatches = useMemo(
    () => filterByLocation(results, locationFilter),
    [results, locationFilter],
  );

  const segments: { key: Segment; label: string }[] = [
    { key: "upcoming", label: i18n.t("schedule.upcoming") },
    { key: "results", label: i18n.t("schedule.results") },
  ];

  const locationFilters: { key: LocationFilter; label: string }[] = [
    { key: "all", label: i18n.t("schedule.all") },
    { key: "home", label: i18n.t("schedule.homeOnly") },
    { key: "away", label: i18n.t("schedule.away") },
  ];

  // Rendered inside the list, not above it — see `MatchList`. Three pills fit on
  // any phone width, so they sit in a plain row: a horizontal ScrollView here
  // would be the first scroll view the native header finds, and the large
  // title would track the pills instead of the matches.
  const controls = (
    <>
      <Segmented segments={segments} selected={segment} onSelect={setSegment} />
      <View
        style={{ flexDirection: "row", alignItems: "center", marginBottom: spacing.md }}
      >
        {locationFilters.map((filter) => (
          <FilterPill
            key={filter.key}
            label={filter.label}
            active={locationFilter === filter.key}
            onPress={() => setLocationFilter(filter.key)}
          />
        ))}
      </View>
    </>
  );

  return (
    <Screen edges={UNDER_NATIVE_HEADER} scroll={false}>
      {segment === "upcoming" ? (
        <MatchList
          matches={upcomingMatches}
          isLoading={upcomingLoading}
          refreshControl={upcomingRefreshControl}
          controls={controls}
        />
      ) : (
        <MatchList
          matches={resultMatches}
          isLoading={resultsLoading}
          refreshControl={resultsRefreshControl}
          controls={controls}
        />
      )}
    </Screen>
  );
}
