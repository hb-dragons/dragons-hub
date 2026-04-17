import { View, Text, Pressable } from "react-native";
import type { RefereeGameListItem } from "@dragons/shared";
import { useTheme } from "../hooks/useTheme";
import { i18n } from "../lib/i18n";
import { fontFamilies } from "../theme/typography";

interface RefereeGameCardProps {
  game: RefereeGameListItem;
  onPress?: () => void;
}

function formatCompactDate(kickoffDate: string, kickoffTime: string): string {
  const locale = i18n.locale === "de" ? "de-DE" : "en-US";
  const d = new Date(kickoffDate + "T00:00:00");
  const weekday = d.toLocaleDateString(locale, { weekday: "short" });
  const day = d.getDate().toString().padStart(2, "0");
  const month = (d.getMonth() + 1).toString().padStart(2, "0");
  const time = kickoffTime.slice(0, 5);
  return `${weekday} ${day}.${month}. ${time}`;
}

interface SlotRowProps {
  label: string;
  name: string | null;
  status: RefereeGameListItem["sr1Status"];
  isMine: boolean;
  ourClub: boolean;
}

function SlotRow({ label, name, status, isMine, ourClub }: SlotRowProps) {
  const { colors, spacing, radius } = useTheme();

  const display = name ?? i18n.t("refereeGame.unassigned");

  const statusColor = isMine
    ? colors.primary
    : status === "assigned"
      ? colors.foreground
      : status === "offered"
        ? colors.heat
        : colors.mutedForeground;

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.xs,
      }}
    >
      <Text
        style={{
          fontSize: 10,
          fontFamily: fontFamilies.bodySemiBold,
          color: colors.mutedForeground,
          minWidth: 24,
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          fontSize: 12,
          fontFamily: isMine ? fontFamilies.bodySemiBold : fontFamilies.body,
          color: statusColor,
          flex: 1,
        }}
        numberOfLines={1}
      >
        {display}
      </Text>
      {isMine ? (
        <View
          style={{
            backgroundColor: colors.primary,
            borderRadius: radius.pill,
            paddingHorizontal: spacing.sm,
            paddingVertical: 2,
          }}
        >
          <Text
            style={{
              fontSize: 9,
              fontFamily: fontFamilies.bodySemiBold,
              color: colors.primaryForeground,
              textTransform: "uppercase",
              letterSpacing: 0.5,
            }}
          >
            {i18n.t("refereeGame.mine")}
          </Text>
        </View>
      ) : ourClub && status === "open" ? (
        <Text
          style={{
            fontSize: 10,
            fontFamily: fontFamilies.bodySemiBold,
            color: colors.mutedForeground,
            textTransform: "uppercase",
            letterSpacing: 0.5,
          }}
        >
          {i18n.t("refereeGame.status.open")}
        </Text>
      ) : null}
    </View>
  );
}

export function RefereeGameCard({ game, onPress }: RefereeGameCardProps) {
  const { colors, radius, spacing, isDark } = useTheme();

  const isAssignedToMe = game.mySlot !== null;

  const cardBg = isAssignedToMe
    ? isDark
      ? "rgba(0,75,35,0.16)"
      : "rgba(0,75,35,0.08)"
    : colors.surfaceLowest;

  const content = (
    <View
      style={{
        backgroundColor: cardBg,
        borderRadius: radius.md,
        padding: spacing.md,
        borderWidth: isAssignedToMe ? 1 : 0,
        borderColor: isAssignedToMe ? colors.primary + "60" : "transparent",
        gap: spacing.sm,
      }}
    >
      {/* Header: date + league */}
      <View
        style={{ flexDirection: "row", justifyContent: "space-between" }}
      >
        <Text
          style={{
            fontSize: 11,
            fontFamily: fontFamilies.body,
            color: colors.mutedForeground,
          }}
        >
          {formatCompactDate(game.kickoffDate, game.kickoffTime)}
        </Text>
        {game.leagueShort ? (
          <Text
            style={{
              fontSize: 11,
              fontFamily: fontFamilies.bodySemiBold,
              color: colors.mutedForeground,
            }}
            numberOfLines={1}
          >
            {game.leagueShort}
          </Text>
        ) : null}
      </View>

      {/* Teams */}
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Text
          style={{
            fontSize: 14,
            fontFamily: fontFamilies.bodySemiBold,
            color: colors.foreground,
            flex: 1,
          }}
          numberOfLines={1}
        >
          {game.homeTeamName}
        </Text>
        <Text
          style={{
            fontSize: 12,
            fontFamily: fontFamilies.body,
            color: colors.mutedForeground,
            marginHorizontal: spacing.xs,
          }}
        >
          {i18n.t("common.vs")}
        </Text>
        <Text
          style={{
            fontSize: 14,
            fontFamily: fontFamilies.body,
            color: colors.foreground,
            flex: 1,
            textAlign: "right",
          }}
          numberOfLines={1}
        >
          {game.guestTeamName}
        </Text>
      </View>

      {/* Venue */}
      {game.venueName ? (
        <Text
          style={{
            fontSize: 11,
            fontFamily: fontFamilies.body,
            color: colors.mutedForeground,
          }}
          numberOfLines={1}
        >
          {game.venueName}
        </Text>
      ) : null}

      {/* Referee slots */}
      <View
        style={{
          borderTopWidth: 1,
          borderTopColor: colors.border,
          paddingTop: spacing.sm,
          gap: spacing.xs,
        }}
      >
        <SlotRow
          label={i18n.t("refereeGame.sr1Short")}
          name={game.sr1Name}
          status={game.sr1Status}
          isMine={game.mySlot === 1}
          ourClub={game.sr1OurClub}
        />
        <SlotRow
          label={i18n.t("refereeGame.sr2Short")}
          name={game.sr2Name}
          status={game.sr2Status}
          isMine={game.mySlot === 2}
          ourClub={game.sr2OurClub}
        />
      </View>
    </View>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => (pressed ? { opacity: 0.85 } : undefined)}
      >
        {content}
      </Pressable>
    );
  }

  return content;
}
