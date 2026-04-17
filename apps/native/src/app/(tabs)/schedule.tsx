import { useState, useMemo, useCallback } from "react";
import { View, Text, SectionList, ScrollView, ActivityIndicator, Pressable } from "react-native";
import type { MatchListItem } from "@dragons/shared";
import { useRouter } from "expo-router";
import useSWR from "swr";
import { useTheme } from "@/hooks/useTheme";
import { Screen } from "@/components/Screen";
import { SectionHeader } from "@/components/SectionHeader";
import { FilterPill } from "@/components/FilterPill";
import { MatchCardFull } from "@/components/MatchCardFull";
import { publicApi } from "@/lib/api";
import { i18n } from "@/lib/i18n";
import { fontFamilies } from "@/theme/typography";

type Segment = "upcoming" | "results";
type LocationFilter = "all" | "home" | "away";

function getToday(): string {
  return new Date().toISOString().split("T")[0];
}

function formatSectionDate(dateStr: string): string {
  const locale = i18n.locale === "de" ? "de-DE" : "en-US";
  const d = new Date(dateStr + "T00:00:00");
  const weekday = d.toLocaleDateString(locale, { weekday: "long" });
  const day = d.getDate().toString().padStart(2, "0");
  const month = (d.getMonth() + 1).toString().padStart(2, "0");
  const year = d.getFullYear();
  return `${weekday}, ${day}.${month}.${year}`;
}

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
    formattedTitle: formatSectionDate(date),
    data: items,
  }));
}

/* ── Segmented Control ── */
function SegmentedControl({
  segments,
  selected,
  onSelect,
}: {
  segments: { key: Segment; label: string }[];
  selected: Segment;
  onSelect: (key: Segment) => void;
}) {
  const { colors, spacing, radius } = useTheme();

  return (
    <View
      style={{
        flexDirection: "row",
        backgroundColor: colors.surfaceHigh,
        borderRadius: radius.md + 4,
        padding: 3,
        marginBottom: spacing.md,
      }}
    >
      {segments.map((seg) => {
        const active = seg.key === selected;
        return (
          <Pressable
            key={seg.key}
            onPress={() => onSelect(seg.key)}
            style={{
              flex: 1,
              paddingVertical: spacing.sm,
              borderRadius: radius.md + 2,
              backgroundColor: active ? colors.background : "transparent",
              alignItems: "center",
              // Subtle shadow on active segment
              ...(active
                ? {
                    shadowColor: "#000",
                    shadowOffset: { width: 0, height: 1 },
                    shadowOpacity: 0.08,
                    shadowRadius: 2,
                    elevation: 1,
                  }
                : {}),
            }}
          >
            <Text
              style={{
                fontSize: 13,
                fontFamily: active ? fontFamilies.bodySemiBold : fontFamilies.body,
                color: active ? colors.foreground : colors.mutedForeground,
              }}
            >
              {seg.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/* ── Match List (reusable for both segments) ── */
function MatchList({
  sections,
  isLoading,
  onRefresh,
  refreshing,
}: {
  sections: Section[];
  isLoading: boolean;
  onRefresh?: () => void;
  refreshing?: boolean;
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
      onRefresh={onRefresh}
      refreshing={refreshing ?? false}
      contentContainerStyle={{ paddingBottom: 100 }}
      showsVerticalScrollIndicator={false}
      stickySectionHeadersEnabled={false}
    />
  );
}

/* ── Main Screen ── */
export default function ScheduleScreen() {
  const { colors, spacing } = useTheme();
  const [segment, setSegment] = useState<Segment>("upcoming");
  const [locationFilter, setLocationFilter] = useState<LocationFilter>("all");

  // Upcoming: from today, ascending
  const {
    data: upcomingData,
    isLoading: upcomingLoading,
    mutate: mutateUpcoming,
  } = useSWR("schedule:upcoming", () =>
    publicApi.getMatches({ limit: 1000, sort: "asc", dateFrom: getToday() }),
  );

  // Results: up to today, descending (most recent first)
  const {
    data: resultsData,
    isLoading: resultsLoading,
    mutate: mutateResults,
  } = useSWR("schedule:results", () =>
    publicApi.getMatches({ limit: 1000, sort: "desc", dateTo: getToday(), hasScore: true }),
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

      <SegmentedControl segments={segments} selected={segment} onSelect={setSegment} />

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
          onRefresh={() => { mutateUpcoming(); }}
          refreshing={false}
        />
      ) : (
        <MatchList
          sections={resultsSections}
          isLoading={resultsLoading}
          onRefresh={() => { mutateResults(); }}
          refreshing={false}
        />
      )}
    </Screen>
  );
}
