import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { Icon } from "@/components/ui/Icon";
import { useTheme } from "@/hooks/useTheme";
import {
  candidateInitials,
  paletteIndexFor,
  type DistanceBracket,
  type RefCandidate,
} from "@/lib/referee/candidates";
import { fontFamilies } from "@/theme/typography";

/**
 * One referee in the assignment sheet's candidate list (issue #223).
 *
 * Everything the assigner decides on is in the row: who the referee is, how
 * far they are from the venue, their licence grade for *this* slot, and the
 * first warning the federation attached to them.
 */

type ThemeColors = ReturnType<typeof useTheme>["colors"];

/**
 * The colour a distance bracket is drawn in — the section header's dot and the
 * row's distance pill, so the two always agree. Exported for the header, the
 * same way `TaskCard` exports its priority stripe colour.
 */
export function bracketColor(bracket: DistanceBracket, colors: ThemeColors): string {
  if (bracket === "close") return colors.primary;
  if (bracket === "med") return colors.heat;
  return colors.destructive;
}

function avatarPalette(key: string, colors: ThemeColors): { bg: string; fg: string } {
  const options = [
    { bg: colors.secondary, fg: colors.secondaryForeground },
    { bg: colors.heatSubtle, fg: colors.heat },
    { bg: colors.surfaceHigh, fg: colors.foreground },
    { bg: colors.muted, fg: colors.mutedForeground },
  ];
  // Non-null: the index is derived modulo the length of a non-empty list.
  return options[paletteIndexFor(key, options.length)]!;
}

interface RefereeCandidateRowProps {
  candidate: RefCandidate;
  /** The section the row sits in; colours its distance pill. */
  bracket: DistanceBracket;
  /** Which slot is being filled — only that slot's licence grade is shown. */
  slot: 1 | 2;
  /** An assignment for *this* candidate is in flight. */
  isAssigning: boolean;
  /** An assignment for *some* candidate is in flight: the list stops taking taps. */
  isBusy: boolean;
  onPress: () => void;
}

export function RefereeCandidateRow({
  candidate,
  bracket,
  slot,
  isAssigning,
  isBusy,
  onPress,
}: RefereeCandidateRowProps) {
  const { colors, spacing, radius } = useTheme();
  const pillColor = bracketColor(bracket, colors);
  const palette = avatarPalette(`${candidate.vorname}${candidate.nachName}`, colors);
  const grade = slot === 1 ? candidate.qmaxSr1 : candidate.qmaxSr2;

  return (
    <Pressable
      onPress={onPress}
      disabled={isBusy}
      accessibilityRole="button"
      accessibilityLabel={`${candidate.vorname} ${candidate.nachName}, ${candidate.distanceKm} km`}
      style={({ pressed }) => ({
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.sm + 2,
        borderRadius: radius.md,
        backgroundColor: pressed ? colors.surfaceHigh : "transparent",
        opacity: isBusy && !isAssigning ? 0.4 : 1,
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.sm,
      })}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 20,
          backgroundColor: palette.bg,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text
          style={{
            fontFamily: fontFamilies.displayMedium,
            fontSize: 13,
            color: palette.fg,
            letterSpacing: 0.5,
          }}
        >
          {candidateInitials(candidate)}
        </Text>
      </View>

      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={{
            fontFamily: fontFamilies.bodySemiBold,
            fontSize: 15,
            color: colors.foreground,
          }}
          numberOfLines={1}
        >
          {candidate.vorname} {candidate.nachName}
        </Text>
        {grade || candidate.ort ? (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              marginTop: 2,
            }}
          >
            {grade ? (
              <View
                style={{
                  backgroundColor: colors.surfaceHigh,
                  paddingHorizontal: 5,
                  paddingVertical: 1,
                  borderRadius: 3,
                }}
              >
                <Text
                  style={{
                    fontFamily: fontFamilies.displayMedium,
                    fontSize: 10,
                    color: colors.foreground,
                    letterSpacing: 0.3,
                  }}
                >
                  {grade}
                </Text>
              </View>
            ) : null}
            {candidate.ort ? (
              <Text
                style={{
                  flex: 1,
                  fontFamily: fontFamilies.body,
                  fontSize: 12,
                  color: colors.mutedForeground,
                }}
                numberOfLines={1}
              >
                {candidate.ort}
              </Text>
            ) : null}
          </View>
        ) : null}
        {candidate.warning.length > 0 ? (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              marginTop: 3,
            }}
          >
            <Icon name="warning" size={11} color={colors.destructive} />
            <Text
              style={{
                flex: 1,
                fontFamily: fontFamilies.bodyMedium,
                fontSize: 11,
                color: colors.destructive,
              }}
              numberOfLines={1}
            >
              {candidate.warning[0]}
            </Text>
          </View>
        ) : null}
      </View>

      <View
        style={{
          paddingHorizontal: spacing.sm,
          paddingVertical: 4,
          borderRadius: radius.pill,
          backgroundColor: pillColor + "22",
        }}
      >
        <Text
          style={{
            fontFamily: fontFamilies.bodyMedium,
            fontSize: 11,
            color: pillColor,
          }}
        >
          {candidate.distanceKm} km
        </Text>
      </View>

      {isAssigning ? (
        <ActivityIndicator size="small" color={colors.mutedForeground} />
      ) : (
        <Icon name="disclosure" size={14} color={colors.mutedForeground} />
      )}
    </Pressable>
  );
}
