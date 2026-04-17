import { useMemo } from "react";
import {
  View,
  Text,
  SectionList,
  ActivityIndicator,
  Pressable,
  RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
import useSWR from "swr";
import type { RefereeGameListItem, MatchListItem } from "@dragons/shared";
import { useTheme } from "@/hooks/useTheme";
import { Screen } from "@/components/Screen";
import { SectionHeader } from "@/components/SectionHeader";
import { MatchCardCompact } from "@/components/MatchCardCompact";
import { refereeApi } from "@/lib/api";
import { i18n } from "@/lib/i18n";
import { fontFamilies } from "@/theme/typography";

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
  data: RefereeGameListItem[];
}

function groupByDate(games: RefereeGameListItem[]): Section[] {
  const grouped = new Map<string, RefereeGameListItem[]>();
  for (const game of games) {
    const key = game.kickoffDate;
    const list = grouped.get(key);
    if (list) list.push(game);
    else grouped.set(key, [game]);
  }
  return Array.from(grouped.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, items]): Section => ({
      title: date,
      formattedTitle: formatSectionDate(date),
      data: items,
    }));
}

/**
 * Adapter from referee-game row → MatchListItem so we can reuse MatchCardCompact.
 * Uses `homeIsOwnClub: true` to render the home-team-prominent layout; the referee
 * has no own-club affiliation but this orientation looks less weird than the "away" variant.
 */
function toMatchListItem(game: RefereeGameListItem): MatchListItem {
  return {
    id: game.matchId ?? game.id,
    apiMatchId: game.apiMatchId,
    matchNo: game.matchNo,
    matchDay: 0,
    kickoffDate: game.kickoffDate,
    kickoffTime: game.kickoffTime,
    homeTeamApiId: 0,
    homeTeamName: game.homeTeamName,
    homeTeamNameShort: null,
    homeTeamCustomName: null,
    guestTeamApiId: 0,
    guestTeamName: game.guestTeamName,
    guestTeamNameShort: null,
    guestTeamCustomName: null,
    homeIsOwnClub: true,
    guestIsOwnClub: false,
    homeBadgeColor: null,
    guestBadgeColor: null,
    homeScore: null,
    guestScore: null,
    leagueId: null,
    leagueName: game.leagueName,
    venueId: null,
    venueName: game.venueName,
    venueStreet: null,
    venuePostalCode: null,
    venueCity: game.venueCity,
    venueNameOverride: null,
    isConfirmed: null,
    isForfeited: game.isForfeited,
    isCancelled: game.isCancelled,
    anschreiber: null,
    zeitnehmer: null,
    shotclock: null,
    publicComment: null,
    hasLocalChanges: false,
    overriddenFields: [],
    booking: null,
  };
}

export default function RefereeScreen() {
  const { colors, textStyles, spacing, radius } = useTheme();
  const router = useRouter();

  const { data, error, isLoading, mutate, isValidating } = useSWR(
    "referee:games",
    () => refereeApi.getGames({ status: "active", limit: 500 }),
  );

  const sections = useMemo(
    () => (data ? groupByDate(data.items) : []),
    [data],
  );

  if (isLoading) {
    return (
      <Screen scroll={false}>
        <SectionHeader title={i18n.t("refereeTab.title")} />
        <View
          style={{
            flex: 1,
            justifyContent: "center",
            alignItems: "center",
            paddingTop: spacing.xl,
          }}
        >
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </Screen>
    );
  }

  if (error) {
    return (
      <Screen scroll={false}>
        <SectionHeader title={i18n.t("refereeTab.title")} />
        <View
          style={{
            flex: 1,
            justifyContent: "center",
            alignItems: "center",
            paddingHorizontal: spacing.xl,
            gap: spacing.md,
          }}
        >
          <Text
            style={[textStyles.body, { color: colors.mutedForeground, textAlign: "center" }]}
          >
            {i18n.t("refereeTab.error")}
          </Text>
          <Pressable
            onPress={() => {
              void mutate();
            }}
            style={{
              backgroundColor: colors.primary,
              borderRadius: radius.md,
              paddingHorizontal: spacing.xl,
              paddingVertical: spacing.md,
            }}
          >
            <Text style={[textStyles.button, { color: colors.primaryForeground }]}>
              {i18n.t("refereeTab.retry")}
            </Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  if (sections.length === 0) {
    return (
      <Screen scroll={false}>
        <SectionHeader title={i18n.t("refereeTab.title")} />
        <View
          style={{
            flex: 1,
            justifyContent: "center",
            alignItems: "center",
            paddingTop: spacing["2xl"],
          }}
        >
          <Text style={[textStyles.body, { color: colors.mutedForeground }]}>
            {i18n.t("refereeTab.empty")}
          </Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll={false}>
      <SectionHeader title={i18n.t("refereeTab.title")} />
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
            <MatchCardCompact
              match={toMatchListItem(item)}
              onPress={() => {
                if (item.matchId !== null) {
                  router.push(`/game/${String(item.matchId)}`);
                }
              }}
            />
          </View>
        )}
        refreshControl={
          <RefreshControl
            refreshing={isValidating && !isLoading}
            onRefresh={() => {
              void mutate();
            }}
            tintColor={colors.primary}
          />
        }
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
        stickySectionHeadersEnabled={false}
      />
    </Screen>
  );
}
