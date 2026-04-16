import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { View, Text, SectionList, ScrollView, ActivityIndicator, Pressable, Animated, StyleSheet } from "react-native";
import type { SectionList as SectionListType, NativeSyntheticEvent, NativeScrollEvent } from "react-native";
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
import { fontFamilies } from "@/theme/typography";

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

export default function ScheduleScreen() {
  const { colors, textStyles, spacing } = useTheme();
  const router = useRouter();
  const [locationFilter, setLocationFilter] = useState<LocationFilter>("all");
  const [showPast, setShowPast] = useState(false);
  const [buttonVisible, setButtonVisible] = useState(false);
  const buttonOpacity = useRef(new Animated.Value(0)).current;
  const listRef = useRef<SectionListType<MatchListItem, Section>>(null);
  // Track the Y offset where upcoming games start (measured during layout)
  const upcomingOffsetRef = useRef(0);

  const { data: upcomingData, isLoading: upcomingLoading } = useSWR(
    "schedule:upcoming",
    () => publicApi.getMatches({ limit: 1000, sort: "asc", dateFrom: getToday() }),
  );

  const { data: pastData, isLoading: pastLoading } = useSWR(
    showPast ? "schedule:past" : null,
    () => publicApi.getMatches({ limit: 1000, sort: "desc", dateTo: getToday(), hasScore: true }),
  );

  const upcoming = upcomingData?.items ?? [];
  const past = pastData?.items ?? [];
  const pastCount = past.length;

  const allMatches = useMemo(() => {
    const pastAsc = [...past].reverse();
    return [...pastAsc, ...upcoming];
  }, [past, upcoming]);

  const filtered = useMemo(() => {
    if (locationFilter === "home") return allMatches.filter((m) => m.homeIsOwnClub);
    if (locationFilter === "away") return allMatches.filter((m) => m.guestIsOwnClub);
    return allMatches;
  }, [allMatches, locationFilter]);

  const sections = useMemo(() => {
    const grouped = new Map<string, MatchListItem[]>();
    for (const match of filtered) {
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
  }, [filtered]);

  // Count items before the first upcoming section to estimate offset
  const pastItemCount = useMemo(() => {
    const today = getToday();
    let count = 0;
    for (const section of sections) {
      if (section.title >= today) break;
      count += section.data.length + 1; // +1 for section header
    }
    return count;
  }, [sections]);

  const handleRefresh = useCallback(() => {
    if (!showPast) setShowPast(true);
  }, [showPast]);

  // Animate button visibility
  useEffect(() => {
    Animated.timing(buttonOpacity, {
      toValue: buttonVisible ? 1 : 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [buttonVisible, buttonOpacity]);

  const handleJumpToToday = useCallback(() => {
    // Use estimated offset: each item ~120px (card + margin + section headers)
    const estimatedItemHeight = 120;
    const offset = pastItemCount * estimatedItemHeight;
    listRef.current?.getScrollResponder()?.scrollTo({ y: offset, animated: true });
  }, [pastItemCount]);

  const handleScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    // Show button when past games are loaded and user is in the past section
    setButtonVisible(pastCount > 0 && y < pastItemCount * 80);
  }, [pastCount, pastItemCount]);

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
          renderSectionHeader={({ section }) => (
            <View style={{
              backgroundColor: colors.background,
              paddingVertical: spacing.xs,
              paddingTop: spacing.md,
            }}>
              <Text style={{
                fontSize: 13,
                fontFamily: fontFamilies.bodySemiBold,
                color: colors.mutedForeground,
              }}>
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
          onRefresh={handleRefresh}
          refreshing={pastLoading}
          maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
          onScroll={handleScroll}
          scrollEventThrottle={64}
          contentContainerStyle={{ paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
          stickySectionHeadersEnabled={false}
        />
      )}

      {/* Jump to today — animated fade */}
      <Animated.View
        pointerEvents={buttonVisible ? "auto" : "none"}
        style={[styles.jumpContainer, { opacity: buttonOpacity, bottom: spacing.xl + 80 }]}
      >
        <Pressable
          onPress={handleJumpToToday}
          style={({ pressed }) => [
            styles.jumpButton,
            {
              backgroundColor: colors.primary,
              transform: [{ scale: pressed ? 0.95 : 1 }],
            },
          ]}
        >
          <Text style={[styles.jumpText, { color: colors.primaryForeground }]}>
            ↓ {i18n.locale === "de" ? "Heute" : "Today"}
          </Text>
        </Pressable>
      </Animated.View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  jumpContainer: {
    position: "absolute",
    alignSelf: "center",
  },
  jumpButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  jumpText: {
    fontSize: 13,
    fontFamily: fontFamilies.bodySemiBold,
  },
});
