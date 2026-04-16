import { getColorPreset, COLOR_PRESETS } from "./team-colors";

export interface NativeTeamColor {
  name: string;
  muted: string;
}

interface NativeColorEntry {
  dark: NativeTeamColor;
  light: NativeTeamColor;
}

const NATIVE_COLORS: Record<string, NativeColorEntry> = {
  blue: {
    dark: { name: "#60a5fa", muted: "#3b82f6" },
    light: { name: "#1d4ed8", muted: "#2563eb" },
  },
  teal: {
    dark: { name: "#5eead4", muted: "#14b8a6" },
    light: { name: "#0f766e", muted: "#0d9488" },
  },
  green: {
    dark: { name: "#86efac", muted: "#22c55e" },
    light: { name: "#15803d", muted: "#16a34a" },
  },
  orange: {
    dark: { name: "#fdba74", muted: "#f97316" },
    light: { name: "#c2410c", muted: "#ea580c" },
  },
  rose: {
    dark: { name: "#fda4af", muted: "#f43f5e" },
    light: { name: "#be123c", muted: "#e11d48" },
  },
  pink: {
    dark: { name: "#f9a8d4", muted: "#ec4899" },
    light: { name: "#be185d", muted: "#db2777" },
  },
  cyan: {
    dark: { name: "#67e8f9", muted: "#06b6d4" },
    light: { name: "#0e7490", muted: "#0891b2" },
  },
  indigo: {
    dark: { name: "#a5b4fc", muted: "#6366f1" },
    light: { name: "#4338ca", muted: "#4f46e5" },
  },
  emerald: {
    dark: { name: "#6ee7b7", muted: "#10b981" },
    light: { name: "#047857", muted: "#059669" },
  },
  violet: {
    dark: { name: "#c4b5fd", muted: "#8b5cf6" },
    light: { name: "#6d28d9", muted: "#7c3aed" },
  },
};

/** Map from dot hex to preset key for reverse lookup */
const DOT_TO_KEY: Record<string, string> = Object.fromEntries(
  Object.entries(COLOR_PRESETS).map(([key, preset]) => [preset.dot, key]),
);

/**
 * Get native-friendly hex color values for a team, suitable for React Native.
 *
 * @param badgeColor - The badgeColor preset key from the team record (e.g. "blue")
 * @param teamName - Used for hash-based fallback when badgeColor is null
 * @param isDark - Whether the app is in dark mode
 */
export function getNativeTeamColor(
  badgeColor: string | null | undefined,
  teamName: string,
  isDark: boolean,
): NativeTeamColor {
  // Resolve the preset key — either directly from badgeColor or via getColorPreset fallback
  let presetKey: string | undefined;

  if (badgeColor && NATIVE_COLORS[badgeColor]) {
    presetKey = badgeColor;
  } else {
    // Use getColorPreset to resolve a consistent fallback, then map its dot back to a key
    const preset = getColorPreset(badgeColor, teamName);
    presetKey = DOT_TO_KEY[preset.dot];
  }

  const entry = presetKey ? NATIVE_COLORS[presetKey] : undefined;

  // Should never happen given the 10 presets cover all dot values, but be safe
  if (!entry) {
    return isDark
      ? { name: "#60a5fa", muted: "#3b82f6" }
      : { name: "#1d4ed8", muted: "#2563eb" };
  }

  return isDark ? entry.dark : entry.light;
}
