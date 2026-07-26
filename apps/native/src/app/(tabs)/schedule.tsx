import { useMemo, useState, useCallback } from "react";
import type { ReactElement } from "react";
import {
  View,
  Text,
  SectionList,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import type { RefreshControlProps } from "react-native";
import type { MatchListItem } from "@dragons/shared";
import { useRouter } from "expo-router";
import useSWR from "swr";
import { useTheme } from "@/hooks/useTheme";
import { useRefresh } from "@/hooks/useRefresh";
import { Screen } from "@/components/Screen";
import { SectionHeader } from "@/components/SectionHeader";
import { FilterPill } from "@/components/FilterPill";
import { MatchCardFull } from "@/components/MatchCardFull";
import { publicApi } from "@/lib/api";
import { i18n } from "@/lib/i18n";
import { kickoffLong, kickoffToday } from "@/lib/format/kickoff";
import { fontFamilies } from "@/theme/typography";
import { Segmented } from "@/components/ui/Segmented";

type Segment = "upcoming" | "results";
type LocationFilter = "all" | "home" | "away";

interface Section {
  title: string;
  formattedTitle: string;
  data: MatchListItem[];
}

function groupByDate(matches: MatchListItem[]): Section[] {
  const grouped = new Map<string, MatchListItem[]>();
  for (const match of matches) {
    const key = match.kickoffDate;
    const list = grouped.get(key);
    if (list) list.push(match);
    else grouped.set(key, [match]);
  }
  return Array.from(grouped.entries()).map(([date, items]): Section => ({
    title: date,
    formattedTitle: kickoffLong(date),
    data: items,
  }));
}

/* ── Match List (reusable for both segments) ── */
function MatchList({
  sections,
  isLoading,
  refreshControl,
}: {
  sections: Section[];
  isLoading: boolean;
  refreshControl?: ReactElement<RefreshControlProps>;
}) {
  const { colors, textStyles, spacing } = useTheme();
  const router = useRouter();

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", paddingTop: spacing.xl }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (sections.length === 0) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", paddingTop: spacing["2xl"] }}>
        <Text style={[textStyles.body, { color: colors.mutedForeground }]}>
          {i18n.t("schedule.noMatches")}
        </Text>
      </View>
    );
  }

  return (
    <SectionList
      sections={sections}
      keyExtractor={(item) => String(item.id)}
      renderSectionHeader={({ section }) => (
        <View
          style={{
            backgroundColor: colors.background,
            paddingVertical: spacing.xs,
            paddingTop: spacing.md,
          }}
        >
          <Text
            style={{
              fontSize: 13,
              fontFamily: fontFamilies.bodySemiBold,
              color: colors.mutedForeground,
            }}
          >
            {section.formattedTitle}
          </Text>
        </View>
      )}
      renderItem={({ item }) => (
        <View style={{ marginBottom: spacing.sm }}>
          <MatchCardFull
            match={item}
            onPress={() => router.push(`/game/${String(item.id)}`)}
          />
        </View>
      )}
      refreshControl={refreshControl}
      contentContainerStyle={SECTION_LIST_CONTENT_STYLE}
      showsVerticalScrollIndicator={false}
      stickySectionHeadersEnabled={false}
    />
  );
}

const SECTION_LIST_CONTENT_STYLE = { paddingBottom: 100 } as const;

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

  // Apply location filter
  const applyFilter = useCallback(
    (matches: MatchListItem[]) => {
      if (locationFilter === "home") return matches.filter((m) => m.homeIsOwnClub);
      if (locationFilter === "away") return matches.filter((m) => m.guestIsOwnClub);
      return matches;
    },
    [locationFilter],
  );

  const upcomingSections = useMemo(
    () => groupByDate(applyFilter(upcoming)),
    [upcoming, applyFilter],
  );

  const resultsSections = useMemo(
    () => groupByDate(applyFilter(results)),
    [results, applyFilter],
  );

  const segments: { key: Segment; label: string }[] = [
    { key: "upcoming", label: i18n.t("schedule.upcoming") },
    { key: "results", label: i18n.t("schedule.results") },
  ];

  return (
    <Screen scroll={false}>
      <SectionHeader title={i18n.t("schedule.title")} />

      <Segmented segments={segments} selected={segment} onSelect={setSegment} />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ alignItems: "center" }}
        style={{ flexGrow: 0, flexShrink: 0, marginBottom: spacing.md, overflow: "visible" }}
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

      {segment === "upcoming" ? (
        <MatchList
          sections={upcomingSections}
          isLoading={upcomingLoading}
          refreshControl={upcomingRefreshControl}
        />
      ) : (
        <MatchList
          sections={resultsSections}
          isLoading={resultsLoading}
          refreshControl={resultsRefreshControl}
        />
      )}
    </Screen>
  );
}
