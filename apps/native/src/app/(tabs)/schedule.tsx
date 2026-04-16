import { useState, useMemo, useCallback } from "react";
import { View, Text, SectionList, ScrollView, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import useSWR from "swr";
import type { MatchListItem } from "@dragons/shared";
import { useTheme } from "@/hooks/useTheme";
import { Screen } from "@/components/Screen";
import { SectionHeader } from "@/components/SectionHeader";
import { FilterPill } from "@/components/FilterPill";
import { MatchCard } from "@/components/MatchCard";
import { publicApi } from "@/lib/api";
import { i18n } from "@/lib/i18n";

type Filter = "all" | "home" | "away";

const PAGE_SIZE = 40;

export default function ScheduleScreen() {
  const { colors, textStyles, spacing } = useTheme();
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const [limit, setLimit] = useState(PAGE_SIZE);

  const { data, isLoading } = useSWR(
    `schedule:matches:${String(limit)}`,
    () => publicApi.getMatches({ limit, sort: "asc" }),
  );

  const matches = data?.items ?? [];
  const hasMore = data?.hasMore ?? false;

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

  const handleLoadMore = useCallback(() => {
    setLimit((prev) => prev + PAGE_SIZE);
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
          onPress={() => setFilter("all")}
        />
        <FilterPill
          label={i18n.t("schedule.homeOnly")}
          active={filter === "home"}
          onPress={() => setFilter("home")}
        />
        <FilterPill
          label={i18n.t("schedule.away")}
          active={filter === "away"}
          onPress={() => setFilter("away")}
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
          sections={sections}
          keyExtractor={(item) => String(item.id)}
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
              <MatchCard
                match={item}
                onPress={() => router.push(`/game/${String(item.id)}`)}
              />
            </View>
          )}
          ListFooterComponent={
            hasMore ? (
              <View style={{ alignItems: "center", paddingVertical: spacing.lg }}>
                <FilterPill
                  label={i18n.t("schedule.loadMore")}
                  active={false}
                  onPress={handleLoadMore}
                />
              </View>
            ) : null
          }
          showsVerticalScrollIndicator={false}
          stickySectionHeadersEnabled={false}
        />
      )}
    </Screen>
  );
}
