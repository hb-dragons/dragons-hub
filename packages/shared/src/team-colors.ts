interface ColorPresetMode {
  bg: string;
  border: string;
  text: string;
}

export interface ColorPreset {
  light: ColorPresetMode;
  dark: ColorPresetMode;
  /**
   * Both modes' classes in one literal string, ready to hand to `className`.
   *
   * A surface must never pick `light` or `dark` for itself: doing so pins the
   * badge to one mode and makes the same team render differently depending on
   * which screen you are looking at. The `dark:` variants must be written out
   * literally here — Tailwind only sees class names that exist verbatim in
   * source, so building them at runtime would emit no rule at all.
   */
  className: string;
  /** Hex color for calendar dots and admin swatches (inline style, not Tailwind) */
  dot: string;
}

export const COLOR_PRESETS: Record<string, ColorPreset> = {
  blue: {
    light: {
      bg: "bg-blue-100",
      border: "border-blue-300",
      text: "text-blue-800",
    },
    dark: {
      bg: "bg-blue-800",
      border: "border-blue-600",
      text: "text-blue-100",
    },
    className:
      "bg-blue-100 border-blue-300 text-blue-800 dark:bg-blue-800 dark:border-blue-600 dark:text-blue-100",
    dot: "#3b82f6",
  },
  teal: {
    light: {
      bg: "bg-teal-100",
      border: "border-teal-300",
      text: "text-teal-800",
    },
    dark: {
      bg: "bg-teal-700",
      border: "border-teal-500",
      text: "text-teal-100",
    },
    className:
      "bg-teal-100 border-teal-300 text-teal-800 dark:bg-teal-700 dark:border-teal-500 dark:text-teal-100",
    dot: "#14b8a6",
  },
  green: {
    light: {
      bg: "bg-green-100",
      border: "border-green-300",
      text: "text-green-800",
    },
    dark: {
      bg: "bg-green-700",
      border: "border-green-500",
      text: "text-green-100",
    },
    className:
      "bg-green-100 border-green-300 text-green-800 dark:bg-green-700 dark:border-green-500 dark:text-green-100",
    dot: "#22c55e",
  },
  orange: {
    light: {
      bg: "bg-orange-100",
      border: "border-orange-300",
      text: "text-orange-800",
    },
    dark: {
      bg: "bg-orange-700",
      border: "border-orange-500",
      text: "text-orange-100",
    },
    className:
      "bg-orange-100 border-orange-300 text-orange-800 dark:bg-orange-700 dark:border-orange-500 dark:text-orange-100",
    dot: "#f97316",
  },
  rose: {
    light: {
      bg: "bg-rose-100",
      border: "border-rose-300",
      text: "text-rose-800",
    },
    dark: {
      bg: "bg-rose-800",
      border: "border-rose-600",
      text: "text-rose-100",
    },
    className:
      "bg-rose-100 border-rose-300 text-rose-800 dark:bg-rose-800 dark:border-rose-600 dark:text-rose-100",
    dot: "#f43f5e",
  },
  pink: {
    light: {
      bg: "bg-pink-100",
      border: "border-pink-300",
      text: "text-pink-800",
    },
    dark: {
      bg: "bg-pink-700",
      border: "border-pink-500",
      text: "text-pink-100",
    },
    className:
      "bg-pink-100 border-pink-300 text-pink-800 dark:bg-pink-700 dark:border-pink-500 dark:text-pink-100",
    dot: "#ec4899",
  },
  cyan: {
    light: {
      bg: "bg-cyan-100",
      border: "border-cyan-300",
      text: "text-cyan-800",
    },
    dark: {
      bg: "bg-cyan-700",
      border: "border-cyan-500",
      text: "text-cyan-100",
    },
    className:
      "bg-cyan-100 border-cyan-300 text-cyan-800 dark:bg-cyan-700 dark:border-cyan-500 dark:text-cyan-100",
    dot: "#06b6d4",
  },
  indigo: {
    light: {
      bg: "bg-indigo-100",
      border: "border-indigo-300",
      text: "text-indigo-800",
    },
    dark: {
      bg: "bg-indigo-700",
      border: "border-indigo-500",
      text: "text-indigo-100",
    },
    className:
      "bg-indigo-100 border-indigo-300 text-indigo-800 dark:bg-indigo-700 dark:border-indigo-500 dark:text-indigo-100",
    dot: "#6366f1",
  },
  emerald: {
    light: {
      bg: "bg-emerald-100",
      border: "border-emerald-300",
      text: "text-emerald-800",
    },
    dark: {
      bg: "bg-emerald-800",
      border: "border-emerald-600",
      text: "text-emerald-100",
    },
    className:
      "bg-emerald-100 border-emerald-300 text-emerald-800 dark:bg-emerald-800 dark:border-emerald-600 dark:text-emerald-100",
    dot: "#10b981",
  },
  violet: {
    light: {
      bg: "bg-violet-100",
      border: "border-violet-300",
      text: "text-violet-800",
    },
    dark: {
      bg: "bg-violet-700",
      border: "border-violet-500",
      text: "text-violet-100",
    },
    className:
      "bg-violet-100 border-violet-300 text-violet-800 dark:bg-violet-700 dark:border-violet-500 dark:text-violet-100",
    dot: "#8b5cf6",
  },
};

export const COLOR_PRESET_KEYS = Object.keys(COLOR_PRESETS);

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

/**
 * Get a color preset by key. Falls back to hash-based selection if key is null/unknown.
 * @param key - The badgeColor preset key from the team record
 * @param teamName - Used for hash-based fallback when key is null
 */
export function getColorPreset(
  key: string | null | undefined,
  teamName?: string,
): ColorPreset {
  if (key && COLOR_PRESETS[key]) {
    return COLOR_PRESETS[key];
  }
  const fallbackKey = teamName
    ? COLOR_PRESET_KEYS[hashString(teamName) % COLOR_PRESET_KEYS.length]!
    : COLOR_PRESET_KEYS[0]!;
  return COLOR_PRESETS[fallbackKey]!;
}
