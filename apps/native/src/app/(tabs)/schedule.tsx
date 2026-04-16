import { useState, useMemo, useRef, useCallback } from "react";
import { View, Text, SectionList, ScrollView, ActivityIndicator } from "react-native";
import type { SectionList as SectionListType } from "react-native";
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

type Filter = "all" | "home" | "away";

export default function ScheduleScreen() {
  const { colors, textStyles, spacing } = useTheme();
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const listRef = useRef<SectionListType<MatchListItem>>(null);
  const hasScrolled = useRef(false);

  const { data, isLoading } = useSWR(
    "schedule:matches:all",
    () => publicApi.getMatches({ limit: 1000, sort: "asc" }),
  );

  const matches = data?.items ?? [];

  const filtered = useMemo(() => {
    if (filter === "home") return matches.filter((m) => m.homeIsOwnClub);
    if (filter === "away") return matches.filter((m) => m.guestIsOwnClub);
    return matches;
  }, [matches, filter]);

  const sections = useMemo(() => {
    const grouped = new Map<string, MatchListItem[]>();
    for (const match of filtered) {
      const key = match.kickoffDate;
      const list = grouped.get(key);
      if (list) {
        list.push(match);
      } else {
        grouped.set(key, [match]);
      }
    }
    return Array.from(grouped.entries()).map(([date, items]) => ({
      title: date,
      data: items,
    }));
  }, [filtered]);

  // Find the section index of the first upcoming date
  const firstUpcomingSectionIndex = useMemo(() => {
    const today = new Date().toISOString().split("T")[0];
    for (let i = 0; i < sections.length; i++) {
      if (sections[i]!.title >= today) return i;
    }
    return -1;
  }, [sections]);

  // Scroll once after content is laid out
  const handleContentSizeChange = useCallback(() => {
    if (hasScrolled.current || sections.length === 0 || firstUpcomingSectionIndex < 0) return;
    hasScrolled.current = true;

    listRef.current?.scrollToLocation({
      sectionIndex: firstUpcomingSectionIndex,
      itemIndex: 0,
      animated: false,
      viewOffset: 0,
    });
  }, [sections, firstUpcomingSectionIndex]);

  const handleFilterChange = useCallback((f: Filter) => {
    hasScrolled.current = false;
    setFilter(f);
  }, []);

  if (isLoading && matches.length === 0) {
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
          label={i18n.t("schedule.allGames")}
          active={filter === "all"}
          onPress={() => handleFilterChange("all")}
        />
        <FilterPill
          label={i18n.t("schedule.homeOnly")}
          active={filter === "home"}
          onPress={() => handleFilterChange("home")}
        />
        <FilterPill
          label={i18n.t("schedule.away")}
          active={filter === "away"}
          onPress={() => handleFilterChange("away")}
        />
      </ScrollView>

      {sections.length === 0 ? (
        <View style={{ paddingTop: spacing.xl, alignItems: "center" }}>
          <Text style={[textStyles.body, { color: colors.mutedForeground }]}>
            {i18n.t("schedule.noMatches")}
          </Text>
        </View>
      ) : (
        <SectionList
          ref={listRef}
          sections={sections}
          keyExtractor={(item) => String(item.id)}
          onContentSizeChange={handleContentSizeChange}
          renderSectionHeader={({ section }) => (
            <Text
              style={[
                textStyles.label,
                {
                  color: colors.mutedForeground,
                  paddingVertical: spacing.sm,
                  backgroundColor: colors.background,
                },
              ]}
            >
              {section.title}
            </Text>
          )}
          renderItem={({ item }) => (
            <View style={{ marginBottom: spacing.sm }}>
              <MatchCardFull
                match={item}
                onPress={() => router.push(`/game/${String(item.id)}`)}
              />
            </View>
          )}
          showsVerticalScrollIndicator={false}
          stickySectionHeadersEnabled={false}
          // Render enough items so scrollToLocation target exists on first pass
          initialNumToRender={filtered.length}
        />
      )}
    </Screen>
  );
}
