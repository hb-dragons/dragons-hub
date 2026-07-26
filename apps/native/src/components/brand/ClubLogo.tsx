import { View } from "react-native";
import { Image } from "expo-image";
import { clubLogoUrl } from "@dragons/shared";
import { useTheme } from "../../hooks/useTheme";
import { clubLogoMetrics, type ClubLogoVariant } from "@/lib/ui/club-logo";

type ClubLogoProps = {
  clubId?: number | null;
  size?: number;
  /**
   * `"chip"` insets the crest inside a tonal container (same outer footprint);
   * `"plain"` renders the crest bare. This prop was previously declared and
   * then silently dropped, so every `variant="chip"` call site got plain.
   */
  variant?: ClubLogoVariant;
};

export function ClubLogo({ clubId, size = 24, variant = "plain" }: ClubLogoProps) {
  const { colors } = useTheme();
  const metrics = clubLogoMetrics(size, variant);

  if (!clubId) {
    return (
      <View
        style={{
          width: metrics.boxSize,
          height: metrics.boxSize,
          borderRadius: metrics.borderRadius,
          backgroundColor: colors.muted,
        }}
      />
    );
  }

  const image = (
    <Image
      source={{ uri: clubLogoUrl(clubId) }}
      style={{ width: metrics.imageSize, height: metrics.imageSize }}
      contentFit="contain"
      transition={120}
      cachePolicy="memory-disk"
      accessibilityIgnoresInvertColors
    />
  );

  if (!metrics.chip) return image;

  return (
    <View
      style={{
        width: metrics.boxSize,
        height: metrics.boxSize,
        borderRadius: metrics.borderRadius,
        // Tonal lift rather than a border (design system rule 1/2).
        backgroundColor: colors.surfaceLow,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {image}
    </View>
  );
}
