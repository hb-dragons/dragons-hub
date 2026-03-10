export interface ColorPresetMode {
  bg: string;
  border: string;
  text: string;
}

export interface ColorPreset {
  light: ColorPresetMode;
  dark: ColorPresetMode;
  /** Tailwind bg class for the calendar dot (works in both modes) */
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
    dot: "bg-blue-500",
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
    dot: "bg-teal-500",
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
    dot: "bg-green-500",
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
    dot: "bg-orange-500",
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
    dot: "bg-rose-500",
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
    dot: "bg-pink-500",
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
    dot: "bg-cyan-500",
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
    dot: "bg-indigo-500",
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
    dot: "bg-emerald-500",
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
    dot: "bg-violet-500",
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
