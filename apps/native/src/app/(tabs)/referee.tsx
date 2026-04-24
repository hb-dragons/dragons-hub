import { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  SectionList,
  ActivityIndicator,
  Pressable,
  RefreshControl,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import useSWR from "swr";
import { APIError } from "@dragons/api-client";
import { can, type RefereeGameListItem } from "@dragons/shared";
import { useTheme } from "@/hooks/useTheme";
import { useRefresh } from "@/hooks/useRefresh";
import { Screen } from "@/components/Screen";
import { SectionHeader } from "@/components/SectionHeader";
import { RefereeGameCard } from "@/components/RefereeGameCard";
import { AssignRefereeModal } from "@/components/AssignRefereeModal";
import { authClient } from "@/lib/auth-client";
import { refereeApi } from "@/lib/api";
import { i18n } from "@/lib/i18n";
import { fontFamilies } from "@/theme/typography";

type Segment = "mine" | "open" | "past";

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

function groupByDate(
  games: RefereeGameListItem[],
  order: "asc" | "desc" = "asc",
): Section[] {
  const grouped = new Map<string, RefereeGameListItem[]>();
  for (const game of games) {
    const key = game.kickoffDate;
    const list = grouped.get(key);
    if (list) list.push(game);
    else grouped.set(key, [game]);
  }
  const entries = Array.from(grouped.entries()).sort(([a], [b]) =>
    order === "asc" ? a.localeCompare(b) : b.localeCompare(a),
  );
  return entries.map(([date, items]): Section => ({
    title: date,
    formattedTitle: formatSectionDate(date),
    data: items,
  }));
}

function todayIsoDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = (now.getMonth() + 1).toString().padStart(2, "0");
  const d = now.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function hasAvailableSlot(g: RefereeGameListItem): boolean {
  return (
    (g.sr1OurClub && g.sr1Status !== "assigned") ||
    (g.sr2OurClub && g.sr2Status !== "assigned") ||
    g.sr1Status === "offered" ||
    g.sr2Status === "offered"
  );
}

function partitionGames(
  items: RefereeGameListItem[],
  today: string,
): {
  mine: RefereeGameListItem[];
  open: RefereeGameListItem[];
  past: RefereeGameListItem[];
} {
  const mine: RefereeGameListItem[] = [];
  const open: RefereeGameListItem[] = [];
  const past: RefereeGameListItem[] = [];
  for (const g of items) {
    const isPast = g.kickoffDate < today;
    if (isPast) {
      if (g.mySlot !== null) past.push(g);
      continue;
    }
    if (g.mySlot !== null) mine.push(g);
    else if (hasAvailableSlot(g) && !g.isCancelled && !g.isForfeited) open.push(g);
  }
  return { mine, open, past };
}

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

export default function RefereeScreen() {
  const { colors, textStyles, spacing, radius } = useTheme();
  const router = useRouter();

  const { data: session } = authClient.useSession();
  const isAdmin = can(
    (session?.user ?? null) as { role?: string | null } | null,
    "assignment",
    "view",
  );

  const [segment, setSegment] = useState<Segment>(isAdmin ? "open" : "mine");
  const [assignModal, setAssignModal] = useState<{
    game: RefereeGameListItem;
    slotNumber: 1 | 2;
  } | null>(null);

  // Once we learn the user is admin, snap to "open" if still on default "mine".
  useEffect(() => {
    if (isAdmin && segment === "mine") setSegment("open");
  }, [isAdmin, segment]);

  const { data, error, isLoading, mutate } = useSWR(
    "referee:games",
    () => refereeApi.getGames({ status: "active", limit: 500 }),
  );

  async function handleUnassign(
    game: RefereeGameListItem,
    slotNumber: 1 | 2,
    refereeName: string,
  ) {
    Alert.alert(
      i18n.t("refereeGame.admin.removeConfirmTitle"),
      i18n.t("refereeGame.admin.removeConfirmMessage", { name: refereeName }),
      [
        { text: i18n.t("refereeGame.admin.cancel"), style: "cancel" },
        {
          text: i18n.t("refereeGame.admin.remove"),
          style: "destructive",
          onPress: () => {
            void (async () => {
              try {
                await refereeApi.unassignReferee(game.apiMatchId, slotNumber);
                await mutate();
                Alert.alert(i18n.t("refereeGame.admin.removeSuccess"));
              } catch (e) {
                const message =
                  e instanceof APIError
                    ? e.message
                    : i18n.t("refereeGame.admin.removeFailed");
                Alert.alert(
                  i18n.t("refereeGame.admin.removeFailed"),
                  message,
                );
              }
            })();
          },
        },
      ],
    );
  }

  const { refreshing, onRefresh } = useRefresh(() => mutate());

  const refreshControl = useMemo(
    () => (
      <RefreshControl
        refreshing={refreshing}
        onRefresh={() => {
          void onRefresh();
        }}
        tintColor={colors.primary}
      />
    ),
    [refreshing, onRefresh, colors.primary],
  );

  const listContentStyle = useMemo(
    () => ({ paddingTop: spacing.sm, paddingBottom: 100 }),
    [spacing.sm],
  );

  const {
    mineSections,
    openSections,
    pastSections,
    mineCount,
    openCount,
    pastCount,
  } = useMemo(() => {
    if (!data) {
      return {
        mineSections: [],
        openSections: [],
        pastSections: [],
        mineCount: 0,
        openCount: 0,
        pastCount: 0,
      };
    }
    const { mine, open, past } = partitionGames(data.items, todayIsoDate());
    return {
      mineSections: groupByDate(mine, "asc"),
      openSections: groupByDate(open, "asc"),
      pastSections: groupByDate(past, "desc"),
      mineCount: mine.length,
      openCount: open.length,
      pastCount: past.length,
    };
  }, [data]);

  const sections =
    segment === "mine"
      ? mineSections
      : segment === "open"
        ? openSections
        : pastSections;
  const emptyKey =
    segment === "mine"
      ? "refereeTab.emptyMine"
      : segment === "open"
        ? "refereeTab.emptyOpen"
        : "refereeTab.emptyPast";

  const segments: { key: Segment; label: string }[] = [
    ...(isAdmin
      ? []
      : [
          {
            key: "mine" as const,
            label: `${i18n.t("refereeTab.segmentMine")}${mineCount > 0 ? ` (${mineCount})` : ""}`,
          },
        ]),
    {
      key: "open",
      label: `${i18n.t("refereeTab.segmentOpen")}${openCount > 0 ? ` (${openCount})` : ""}`,
    },
    {
      key: "past",
      label: `${i18n.t("refereeTab.segmentPast")}${pastCount > 0 ? ` (${pastCount})` : ""}`,
    },
  ];

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
            style={[
              textStyles.body,
              { color: colors.mutedForeground, textAlign: "center" },
            ]}
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

  return (
    <Screen scroll={false}>
      <SectionHeader title={i18n.t("refereeTab.title")} />
      <SegmentedControl segments={segments} selected={segment} onSelect={setSegment} />
      {sections.length === 0 ? (
        <View
          style={{
            flex: 1,
            justifyContent: "center",
            alignItems: "center",
            paddingTop: spacing["2xl"],
          }}
        >
          <Text style={[textStyles.body, { color: colors.mutedForeground }]}>
            {i18n.t(emptyKey)}
          </Text>
        </View>
      ) : (
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
              <RefereeGameCard
                game={item}
                isAdmin={isAdmin}
                onAdminAssign={
                  isAdmin
                    ? (slotNumber) =>
                        setAssignModal({ game: item, slotNumber })
                    : undefined
                }
                onAdminUnassign={
                  isAdmin
                    ? (slotNumber, name) =>
                        handleUnassign(item, slotNumber, name)
                    : undefined
                }
                onPress={() => {
                  const isOwnClubGame = item.isHomeGame || item.isGuestGame;
                  if (isOwnClubGame && item.matchId !== null) {
                    router.push(`/game/${String(item.matchId)}`);
                  } else {
                    router.push(`/referee-game/${String(item.id)}`);
                  }
                }}
              />
            </View>
          )}
          refreshControl={refreshControl}
          contentContainerStyle={listContentStyle}
          showsVerticalScrollIndicator={false}
          stickySectionHeadersEnabled={false}
        />
      )}
      <AssignRefereeModal
        visible={assignModal !== null}
        game={assignModal?.game ?? null}
        slotNumber={assignModal?.slotNumber ?? 1}
        onClose={() => setAssignModal(null)}
        onSuccess={async () => {
          await mutate();
        }}
      />
    </Screen>
  );
}
