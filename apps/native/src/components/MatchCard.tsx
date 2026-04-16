import { View, Text, Pressable } from "react-native";
import type { MatchListItem } from "@dragons/shared";
import { useTheme } from "@/hooks/useTheme";
import { Badge } from "./Badge";

interface MatchCardProps {
  match: MatchListItem;
  onPress?: () => void;
}

function formatTime(kickoffTime: string): string {
  // kickoffTime is "HH:MM:SS" or "HH:MM" — show HH:MM
  return kickoffTime.slice(0, 5);
}

export function MatchCard({ match, onPress }: MatchCardProps) {
  const { colors, radius, textStyles, spacing } = useTheme();

  const isOwnClub = match.homeIsOwnClub || match.guestIsOwnClub;
  const hasScore = match.homeScore !== null && match.guestScore !== null;

  const homeName =
    match.homeTeamCustomName || match.homeTeamNameShort || match.homeTeamName;
  const guestName =
    match.guestTeamCustomName || match.guestTeamNameShort || match.guestTeamName;

  const venueName = match.venueNameOverride || match.venueName;

  const content = (
    <View
      style={{
        backgroundColor: colors.surfaceLowest,
        borderRadius: radius.md,
        padding: spacing.lg,
        borderLeftWidth: isOwnClub ? 2 : 0,
        borderLeftColor: isOwnClub ? colors.primary : "transparent",
      }}
    >
      {/* Top row: time + badge */}
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: spacing.sm,
        }}
      >
        <Text style={[textStyles.caption, { color: colors.mutedForeground }]}>
          {formatTime(match.kickoffTime)}
        </Text>
        {match.homeIsOwnClub ? (
          <Badge label="HOME" />
        ) : match.guestIsOwnClub ? (
          <Badge label="AWAY" />
        ) : null}
      </View>

      {/* Teams + score */}
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <View style={{ flex: 1 }}>
          <Text
            style={[
              textStyles.body,
              {
                color: match.homeIsOwnClub
                  ? colors.primary
                  : colors.foreground,
                fontFamily: match.homeIsOwnClub
                  ? textStyles.button.fontFamily
                  : textStyles.body.fontFamily,
              },
            ]}
            numberOfLines={1}
          >
            {homeName}
          </Text>
          <Text
            style={[
              textStyles.body,
              {
                color: match.guestIsOwnClub
                  ? colors.primary
                  : colors.foreground,
                fontFamily: match.guestIsOwnClub
                  ? textStyles.button.fontFamily
                  : textStyles.body.fontFamily,
                marginTop: spacing.xs,
              },
            ]}
            numberOfLines={1}
          >
            {guestName}
          </Text>
        </View>

        {hasScore ? (
          <View style={{ alignItems: "flex-end", marginLeft: spacing.md }}>
            <Text style={[textStyles.cardTitle, { color: colors.foreground }]}>
              {match.homeScore}
            </Text>
            <Text
              style={[
                textStyles.cardTitle,
                { color: colors.foreground, marginTop: spacing.xs },
              ]}
            >
              {match.guestScore}
            </Text>
          </View>
        ) : null}
      </View>

      {/* Venue */}
      {venueName ? (
        <Text
          style={[
            textStyles.caption,
            { color: colors.mutedForeground, marginTop: spacing.sm },
          ]}
          numberOfLines={1}
        >
          {venueName}
        </Text>
      ) : null}
    </View>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) =>
          pressed ? { opacity: 0.85 } : undefined
        }
      >
        {content}
      </Pressable>
    );
  }

  return content;
}
