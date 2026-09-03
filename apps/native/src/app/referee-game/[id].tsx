import type { ReactNode } from "react";
import { View, Text, ActivityIndicator, Platform, Pressable } from "react-native";
import { useLocalSearchParams, Stack, router } from "expo-router";
import useSWR from "swr";
import { APIError } from "@dragons/api-client";
import type { RefereeGameListItem } from "@dragons/shared";
import { useTheme } from "@/hooks/useTheme";
import { Screen, UNDER_NATIVE_HEADER } from "@/components/Screen";
import { Card } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { ClaimGameButton } from "@/components/ClaimGameButton";
import { openExternal } from "@/lib/legal/open-external";
import { refereeApi } from "@/lib/api";
import {
  einsatzView,
  type EinsatzContact,
  type EinsatzSlot,
} from "@/lib/referee/einsatz";
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
          {slot.tentative ? (
            <Badge label={i18n.t("refereeGame.tentative")} variant="heat" />
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

/**
 * One person a referee can reach (#313). The number and the address are
 * pressable: `tel:` hands the call to the dialer, `mailto:` to the mail app,
 * and `openExternal` reports a device with no handler for either.
 */
function ContactRow({ contact }: { contact: EinsatzContact }) {
  const { colors, textStyles, spacing } = useTheme();
  const { name, phone, email } = contact;

  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={[textStyles.body, { color: colors.foreground }]}>{name}</Text>
      <Text style={[textStyles.caption, { color: colors.mutedForeground }]}>
        {i18n.t(contact.roleKey)}
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.lg }}>
        {phone ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${i18n.t("refereeGame.call")}: ${name}`}
            onPress={() => openExternal(phone.url)}
          >
            <Text style={[textStyles.body, { color: colors.primary }]}>{phone.label}</Text>
          </Pressable>
        ) : null}
        {email ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${i18n.t("refereeGame.mail")}: ${name}`}
            onPress={() => openExternal(email.url)}
          >
            <Text style={[textStyles.body, { color: colors.primary }]}>{email.label}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

/**
 * A labelled panel on the surface the Officials block already uses. Both
 * contact blocks (#313) have the same shape, and a third copy of the label,
 * radius, padding and gap is a third place to keep them in step.
 */
function Section({ label, children }: { label: string; children: ReactNode }) {
  const { colors, spacing, radius } = useTheme();

  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text
        style={{
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: 0.5,
          color: colors.mutedForeground,
          fontFamily: fontFamilies.displayMedium,
          marginBottom: spacing.sm,
        }}
      >
        {label}
      </Text>
      <View
        style={{
          backgroundColor: colors.surfaceLowest,
          borderRadius: radius.md,
          padding: spacing.lg,
          gap: spacing.md,
        }}
      >
        {children}
      </View>
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
        headerTitle: game ? einsatzView(game, Platform.OS).title : "",
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
  const view = einsatzView(game, Platform.OS);
  const spielinfoRoute = view.spielinfoRoute;
  const address = view.address;
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

      {/* ── 1b. What the federation changed after publishing (#309) ── */}
      {view.changes.length > 0 ? (
        <View
          style={{
            backgroundColor: colors.surfaceLowest,
            borderRadius: radius.md,
            borderLeftWidth: 3,
            borderLeftColor: colors.primary,
            padding: spacing.lg,
            marginBottom: spacing.md,
            gap: spacing.xs,
          }}
        >
          {view.changes.map((change) => (
            <Text
              key={change}
              style={[textStyles.caption, { color: colors.foreground }]}
            >
              {i18n.t(`refereeGame.changed.${change}`)}
            </Text>
          ))}
        </View>
      ) : null}

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

      {/* ── 2c. Anfahrt (#309) ── */}
      {/* Absent for rows synced before the address columns existed; the city
          then stays in the detail rows below instead of showing as a blank. */}
      {address ? (
        <Card
          style={{ marginBottom: spacing.md }}
          onPress={() => openExternal(address.mapsUrl)}
        >
          <View style={detailRowStyle}>
            <View style={{ flex: 1, gap: spacing.xs }}>
              <Text style={[sectionLabelStyle, { marginBottom: spacing.xs }]}>
                {i18n.t("refereeGame.address")}
              </Text>
              {venueName ? (
                <Text style={[textStyles.body, { color: colors.foreground }]}>
                  {venueName}
                </Text>
              ) : null}
              <Text style={[textStyles.body, { color: colors.foreground }]}>
                {address.street}
              </Text>
              {address.cityLine ? (
                <Text style={[textStyles.body, { color: colors.foreground }]}>
                  {address.cityLine}
                </Text>
              ) : null}
            </View>
            <Text
              style={[
                textStyles.body,
                { color: colors.primary, marginLeft: spacing.md },
              ]}
            >
              {i18n.t("refereeGame.route")}
            </Text>
          </View>
        </Card>
      ) : null}

      {/* ── 2d. Kampfgericht (#313) ── */}
      {/* Home games with a linked match only, and only for a caller who holds
          the game — the lib returns an empty list for everyone else. */}
      {view.kampfgericht.length > 0 ? (
        <Section label={i18n.t("refereeGame.kampfgericht")}>
          {view.kampfgericht.map((line) => (
            <View key={line.key} style={{ gap: spacing.sm }}>
              <View style={detailRowStyle}>
                <Text style={[textStyles.caption, { color: colors.mutedForeground }]}>
                  {line.roleKeys.map((key) => i18n.t(key)).join(" · ")}
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
                  {line.teamName}
                </Text>
              </View>
              {line.contacts.map((contact) => (
                <ContactRow key={contact.key} contact={contact} />
              ))}
            </View>
          ))}
        </Section>
      ) : null}

      {/* ── 2e. Kontakt (#313) ── */}
      {/* The Dragons team playing — both of them in a derby. A foreign game
          has nobody of ours in it, and shows no block at all. */}
      {view.contacts.length > 0 ? (
        <Section label={i18n.t("refereeGame.contacts")}>
          {view.contacts.map((group) => (
            <View key={group.key} style={{ gap: spacing.sm }}>
              <Text style={[textStyles.caption, { color: colors.mutedForeground }]}>
                {group.teamName}
              </Text>
              {group.contacts.map((contact) => (
                <ContactRow key={contact.key} contact={contact} />
              ))}
            </View>
          ))}
        </Section>
      ) : null}

      {/* ── 3. Spielinfo ── */}
      {spielinfoRoute ? (
        <Card
          style={{ marginBottom: spacing.md }}
          onPress={() => router.push(spielinfoRoute)}
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

      {/* ── 5. The game on basketball-bund.net (#309) ── */}
      <Card
        style={{ marginBottom: spacing.md }}
        onPress={() => openExternal(view.federationUrl)}
      >
        <View style={[detailRowStyle, { alignItems: "center" }]}>
          <Text style={[textStyles.body, { color: colors.foreground, flex: 1 }]}>
            {i18n.t("refereeGame.federationLink")}
          </Text>
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
      </Screen>
    </>
  );
}
