import { View, Text, ActivityIndicator, Pressable } from "react-native";
import { useLocalSearchParams, Stack, router } from "expo-router";
import useSWR from "swr";
import { APIError } from "@dragons/api-client";
import type { RefereeGameListItem } from "@dragons/shared";
import { useTheme } from "@/hooks/useTheme";
import { Screen, UNDER_NATIVE_HEADER } from "@/components/Screen";
import { Card } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { ClaimGameButton } from "@/components/ClaimGameButton";
import { refereeApi } from "@/lib/api";
import { einsatzView, type EinsatzSlot } from "@/lib/referee/einsatz";
import { i18n } from "@/lib/i18n";
import { kickoffCompact } from "@/lib/format/kickoff";
import { fontFamilies } from "@/theme/typography";

function slotStatusVariant(
  status: RefereeGameListItem["sr1Status"],
): "default" | "secondary" | "heat" {
  if (status === "assigned") return "default";
  if (status === "offered") return "heat";
  return "secondary";
}

function OfficialSlot({ slot }: { slot: EinsatzSlot }) {
  const { colors, textStyles, spacing } = useTheme();
  const displayName = slot.name ?? i18n.t("refereeGame.unassigned");
  const nameColor = slot.name
    ? slot.isMine
      ? colors.primary
      : colors.foreground
    : colors.mutedForeground;

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
          {i18n.t(slot.labelKey)}
        </Text>
        <View
          style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}
        >
          {slot.isMine ? (
            <Badge label={i18n.t("refereeGame.mine")} variant="default" />
          ) : null}
          <Badge
            label={i18n.t(`refereeGame.status.${slot.status}`)}
            variant={slotStatusVariant(slot.status)}
          />
        </View>
      </View>
      <Text
        style={[
          textStyles.body,
          {
            color: nameColor,
            fontFamily: slot.isMine
              ? fontFamilies.bodySemiBold
              : textStyles.body.fontFamily,
          },
        ]}
      >
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

  // Built before the loading and error branches, and rendered by all three:
  // attaching header options only once the game arrives reconfigures the
  // native header mid push-transition, which flashes a header overlay.
  const header = (
    <Stack.Screen
      options={{
        headerTitle: game ? einsatzView(game).title : "",
      }}
    />
  );

  if (isLoading) {
    return (
      <>
        {header}
        <Screen edges={UNDER_NATIVE_HEADER}>
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
      </>
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
      <>
        {header}
        <Screen edges={UNDER_NATIVE_HEADER}>
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
      </>
    );
  }

  // Which sections this Einsatz carries — the Spielinfo link, the detail rows,
  // the status badges — is decided in the lib and tested there (#307); the
  // screen only renders the result.
  const view = einsatzView(game);
  const venueName = game.venueName;

  return (
    <>
      {header}
      <Screen edges={UNDER_NATIVE_HEADER} onRefresh={() => mutate()}>
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
            {kickoffCompact(game.kickoffDate, game.kickoffTime)}
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
          <OfficialSlot slot={view.slots[0]} />

          <View
            style={{
              height: 1,
              backgroundColor: colors.border,
              opacity: 0.25,
            }}
          />

          <OfficialSlot slot={view.slots[1]} />
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

      {/* ── 3. Spielinfo ── */}
      {view.spielinfoRoute ? (
        <Card
          style={{ marginBottom: spacing.md }}
          onPress={() => {
            if (view.spielinfoRoute) router.push(view.spielinfoRoute);
          }}
        >
          <View style={detailRowStyle}>
            <View style={{ flex: 1, gap: spacing.xs }}>
              <Text style={[textStyles.body, { color: colors.foreground }]}>
                {i18n.t("refereeGame.matchInfo")}
              </Text>
              <Text style={[textStyles.caption, { color: colors.mutedForeground }]}>
                {i18n.t("refereeGame.matchInfoHint")}
              </Text>
            </View>
            <Text
              style={[
                textStyles.body,
                { color: colors.primary, marginLeft: spacing.md },
              ]}
            >
              {i18n.t("refereeGame.open")}
            </Text>
          </View>
        </Card>
      ) : null}

      {/* ── 4. Details ── */}
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
          {view.details.map((row) => (
            <View key={row.key} style={detailRowStyle}>
              <Text style={[textStyles.caption, { color: colors.mutedForeground }]}>
                {i18n.t(row.labelKey)}
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
                {row.value}
              </Text>
            </View>
          ))}

          {view.badges.length > 0 ? (
            <>
              <View
                style={{
                  height: 1,
                  backgroundColor: colors.border,
                  opacity: 0.25,
                  marginVertical: spacing.xs,
                }}
              />
              <View style={[detailRowStyle, { alignItems: "center" }]}>
                <Text style={[textStyles.caption, { color: colors.mutedForeground }]}>
                  {i18n.t("gameDetail.status")}
                </Text>
                <View style={{ flexDirection: "row", gap: spacing.sm }}>
                  {view.badges.map((badge) => (
                    <Badge
                      key={badge}
                      label={i18n.t(`gameDetail.${badge}`)}
                      variant={badge === "cancelled" ? "destructive" : "heat"}
                    />
                  ))}
                </View>
              </View>
            </>
          ) : null}
        </View>
      </View>
      </Screen>
    </>
  );
}
