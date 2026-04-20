import { View } from "react-native";
import { Image } from "expo-image";
import { useTheme } from "../../hooks/useTheme";

const BASE_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:3001";

type ClubLogoProps = {
  clubId?: number | null;
  size?: number;
  variant?: "plain" | "chip";
};

export function ClubLogo({ clubId, size = 24 }: ClubLogoProps) {
  const { colors } = useTheme();

  if (!clubId) {
    return (
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 4,
          backgroundColor: colors.muted,
        }}
      />
    );
  }

  const uri = `${BASE_URL}/public/assets/clubs/${clubId}.webp`;

  return (
    <Image
      source={{ uri }}
      style={{ width: size, height: size }}
      contentFit="contain"
      transition={120}
      cachePolicy="memory-disk"
      accessibilityIgnoresInvertColors
    />
  );
}
