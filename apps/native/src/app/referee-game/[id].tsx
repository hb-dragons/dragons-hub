import { View, Text, ActivityIndicator, Pressable } from "react-native";
import { useLocalSearchParams } from "expo-router";
import useSWR from "swr";
import { APIError } from "@dragons/api-client";
import type { RefereeGameListItem } from "@dragons/shared";
import { useTheme } from "@/hooks/useTheme";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { ClaimGameButton } from "@/components/ClaimGameButton";
import { refereeApi } from "@/lib/api";
import { i18n } from "@/lib/i18n";
import { fontFamilies } from "@/theme/typography";

function formatKickoff(kickoffDate: string, kickoffTime: string): string {
  const locale = i18n.locale === "de" ? "de-DE" : "en-US";
  const d = new Date(kickoffDate + "T00:00:00");
  const weekday = d.toLocaleDateString(locale, { weekday: "short" });
  const day = d.getDate().toString().padStart(2, "0");
  const month = (d.getMonth() + 1).toString().padStart(2, "0");
  const time = kickoffTime.slice(0, 5);
  return `${weekday} ${day}.${month}. ${time}`;
}

function slotStatusVariant(
  status: RefereeGameListItem["sr1Status"],
): "default" | "secondary" | "heat" {
  if (status === "assigned") return "default";
  if (status === "offered") return "heat";
  return "secondary";
}

interface OfficialSlotProps {
  label: string;
  name: string | null;
  status: RefereeGameListItem["sr1Status"];
}

function OfficialSlot({ label, name, status }: OfficialSlotProps) {
  const { colors, textStyles, spacing } = useTheme();
  const displayName = name ?? i18n.t("refereeGame.unassigned");
  const nameColor = name ? colors.foreground : colors.mutedForeground;

  return (
    <View style={{ gap: spacing.xs }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: spacing.sm,
        }}
      >
        <Text style={[textStyles.caption, { color: colors.mutedForeground }]}>
          {label}
        </Text>
        <Badge
          label={i18n.t(`refereeGame.status.${status}`)}
          variant={slotStatusVariant(status)}
        />
      </View>
      <Text style={[textStyles.body, { color: nameColor }]}>
        {displayName}
      </Text>
    </View>
  );
}

export default function RefereeGameDetailScreen() {
  const { colors, textStyles, spacing, radius } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();

  const numericId = Number(id);
  const hasValidId = Number.isFinite(numericId) && numericId > 0;

  const {
    data: game,
    isLoading,
    error,
    mutate,
  } = useSWR(
    hasValidId ? `referee-game:${id}` : null,
    () => refereeApi.getGame(numericId),
  );

  const sectionLabelStyle = {
    fontSize: 11,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
    color: colors.mutedForeground,
    fontFamily: fontFamilies.displayMedium,
  };

  const detailRowStyle = {
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    alignItems: "flex-start" as const,
  };

  if (isLoading) {
    return (
      <Screen headerOffset={44}>
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

  if (error || !game) {
    const isNotFound =
      !hasValidId ||
      (error instanceof APIError && (error.status === 404 || error.status === 403));
    const message = isNotFound
      ? i18n.t("gameDetail.notFound")
      : i18n.t("gameDetail.error");
    return (
      <Screen headerOffset={44}>
        <View
          style={{
            flex: 1,
            justifyContent: "center",
            alignItems: "center",
            paddingHorizontal: spacing.xl,
            paddingTop: spacing.xl,
            gap: spacing.md,
          }}
        >
          <Text
            style={[
              textStyles.body,
              { color: colors.mutedForeground, textAlign: "center" },
            ]}
          >
            {message}
          </Text>
          {!isNotFound ? (
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
                {i18n.t("gameDetail.retry")}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </Screen>
    );
  }

  const venueName = game.venueName;
  const address = game.venueCity;

  return (
    <Screen headerOffset={44}>
      {/* ── 1. Teams + Kickoff ── */}
      <Card style={{ marginBottom: spacing.md }}>
        <View style={{ alignItems: "center" }}>
          <Text
            style={[
              textStyles.caption,
              {
                color: colors.mutedForeground,
                textAlign: "center",
                marginBottom: spacing.sm,
              },
            ]}
          >
            {formatKickoff(game.kickoffDate, game.kickoffTime)}
            {venueName ? ` · ${venueName}` : ""}
          </Text>

          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              width: "100%",
            }}
          >
            <View style={{ flex: 1, alignItems: "center" }}>
              <Text
                style={[
                  textStyles.cardTitle,
                  { color: colors.foreground, textAlign: "center" },
                ]}
                numberOfLines={2}
              >
                {game.homeTeamName}
              </Text>
            </View>

            <View style={{ alignItems: "center", paddingHorizontal: spacing.md }}>
              <Text
                style={[textStyles.sectionTitle, { color: colors.mutedForeground }]}
              >
                VS
              </Text>
            </View>

            <View style={{ flex: 1, alignItems: "center" }}>
              <Text
                style={[
                  textStyles.cardTitle,
                  { color: colors.foreground, textAlign: "center" },
                ]}
                numberOfLines={2}
              >
                {game.guestTeamName}
              </Text>
            </View>
          </View>

          {game.leagueName ? (
            <Text
              style={[
                sectionLabelStyle,
                { color: colors.primary, marginTop: spacing.sm },
              ]}
            >
              {game.leagueName}
            </Text>
          ) : null}
        </View>
      </Card>

      {/* ── 2. Officials ── */}
      <View style={{ marginBottom: spacing.md }}>
        <Text style={[sectionLabelStyle, { marginBottom: spacing.sm }]}>
          {i18n.t("refereeGame.officials")}
        </Text>
        <View
          style={{
            backgroundColor: colors.surfaceLowest,
            borderRadius: radius.md,
            padding: spacing.lg,
            gap: spacing.md,
          }}
        >
          <OfficialSlot
            label={i18n.t("refereeGame.sr1")}
            name={game.sr1Name}
            status={game.sr1Status}
          />

          <View
            style={{
              height: 1,
              backgroundColor: colors.border,
              opacity: 0.25,
            }}
          />

          <OfficialSlot
            label={i18n.t("refereeGame.sr2")}
            name={game.sr2Name}
            status={game.sr2Status}
          />
        </View>
      </View>

      {/* ── 2b. Claim action ── */}
      <View style={{ marginBottom: spacing.md }}>
        <ClaimGameButton
          game={game}
          revalidateKeys={["referee:games"]}
          onChanged={async () => {
            await mutate();
          }}
        />
      </View>

      {/* ── 3. Details ── */}
      <View style={{ marginBottom: spacing.md }}>
        <Text style={[sectionLabelStyle, { marginBottom: spacing.sm }]}>
          {i18n.t("gameDetail.details")}
        </Text>
        <View
          style={{
            backgroundColor: colors.surfaceLowest,
            borderRadius: radius.md,
            padding: spacing.lg,
            gap: spacing.sm,
          }}
        >
          {venueName ? (
            <View style={detailRowStyle}>
              <Text style={[textStyles.caption, { color: colors.mutedForeground }]}>
                {i18n.t("gameDetail.venue")}
              </Text>
              <Text
                style={[
                  textStyles.body,
                  {
                    color: colors.foreground,
                    flex: 1,
                    textAlign: "right",
                    marginLeft: spacing.md,
                  },
                ]}
                numberOfLines={2}
              >
                {venueName}
              </Text>
            </View>
          ) : null}

          {address ? (
            <View style={detailRowStyle}>
              <Text style={[textStyles.caption, { color: colors.mutedForeground }]}>
                {i18n.t("gameDetail.address")}
              </Text>
              <Text
                style={[
                  textStyles.body,
                  {
                    color: colors.foreground,
                    flex: 1,
                    textAlign: "right",
                    marginLeft: spacing.md,
                  },
                ]}
                numberOfLines={2}
              >
                {address}
              </Text>
            </View>
          ) : null}

          {(game.isCancelled || game.isForfeited) ? (
            <>
              {(venueName || address) ? (
                <View
                  style={{
                    height: 1,
                    backgroundColor: colors.border,
                    opacity: 0.25,
                    marginVertical: spacing.xs,
                  }}
                />
              ) : null}
              <View style={[detailRowStyle, { alignItems: "center" }]}>
                <Text style={[textStyles.caption, { color: colors.mutedForeground }]}>
                  {i18n.t("gameDetail.status")}
                </Text>
                <View style={{ flexDirection: "row", gap: spacing.sm }}>
                  {game.isCancelled ? (
                    <Badge
                      label={i18n.t("gameDetail.cancelled")}
                      variant="destructive"
                    />
                  ) : null}
                  {game.isForfeited ? (
                    <Badge label={i18n.t("gameDetail.forfeited")} variant="heat" />
                  ) : null}
                </View>
              </View>
            </>
          ) : null}
        </View>
      </View>
    </Screen>
  );
}
