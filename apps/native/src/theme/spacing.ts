/**
 * Dragon's Lair spacing and radius tokens for React Native.
 */

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  "2xl": 32,
  "3xl": 48,
} as const;

export const radius = {
  /** Matches web rounded-md (0.25rem = 4px) */
  md: 4,
  /** Pill shape for badges and chips */
  pill: 9999,
} as const;
