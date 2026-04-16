import { useTheme } from "./useTheme";
import { getNativeTeamColor } from "@dragons/shared";
import type { NativeTeamColor } from "@dragons/shared";

export function useTeamColor(
  badgeColor: string | null | undefined,
  teamName: string,
): NativeTeamColor {
  const { isDark } = useTheme();
  return getNativeTeamColor(badgeColor, teamName, isDark);
}
