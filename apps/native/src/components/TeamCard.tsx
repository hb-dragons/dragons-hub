import { View, Text, Pressable } from "react-native";
import type { PublicTeam } from "@dragons/api-client";
import { getNativeTeamColor } from "@dragons/shared";
import { useTheme } from "@/hooks/useTheme";

interface TeamCardProps {
  team: PublicTeam;
  featured?: boolean;
  onPress?: () => void;
}

export function TeamCard({ team, featured = false, onPress }: TeamCardProps) {
  const { colors, radius, textStyles, spacing, isDark } = useTheme();

  const displayName = team.customName || team.nameShort || team.name;
  const height = featured ? 200 : 120;
  const titleStyle = featured ? textStyles.screenTitle : textStyles.cardTitle;
  const nameColor = getNativeTeamColor(team.badgeColor, team.name, isDark).name;

  const cardContent = (
    <View
      style={{
        backgroundColor: colors.surfaceLow,
        borderRadius: radius.md,
        height,
        padding: spacing.lg,
        justifyContent: "flex-end",
      }}
    >
      <Text
        style={[titleStyle, { color: nameColor }]}
        numberOfLines={2}
      >
        {displayName}
      </Text>
      <Text
        style={[
          textStyles.caption,
          { color: colors.mutedForeground, marginTop: spacing.xs },
        ]}
        numberOfLines={1}
      >
        {team.name}
      </Text>
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
        {cardContent}
      </Pressable>
    );
  }

  return cardContent;
}
