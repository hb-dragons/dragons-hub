/**
 * Dragon's Lair design system color tokens.
 * Ported 1:1 from packages/ui/src/styles/globals.css.
 *
 * Light = "The Elite Architect"
 * Dark  = "The Kinetic Vault"
 */

export const colors = {
  light: {
    background: "#f8f9fa",
    foreground: "#191c1d",
    card: "#ffffff",
    cardForeground: "#191c1d",
    popover: "#ffffff",
    popoverForeground: "#191c1d",
    primary: "#004b23",
    primaryForeground: "#ffffff",
    secondary: "#c8eccb",
    secondaryForeground: "#4c6c51",
    muted: "#edeeef",
    mutedForeground: "#3f4940",
    accent: "#e7e8e9",
    accentForeground: "#191c1d",
    destructive: "#ba1a1a",
    destructiveForeground: "#ffffff",
    border: "#bfc9bd",
    input: "#f3f4f5",
    ring: "#004b23",

    // Surface tonal tiers
    surfaceLowest: "#ffffff",
    surfaceLow: "#f3f4f5",
    surfaceBase: "#edeeef",
    surfaceHigh: "#e7e8e9",
    surfaceHighest: "#e1e3e4",
    surfaceBright: "#f8f9fa",

    // Heat accent (orange)
    heat: "#953d00",
    heatForeground: "#ffffff",
    heatSubtle: "#ffb692",

    // Brand depth
    brand: "#006631",
    brandForeground: "#8be19f",

    // Chart colors
    chart1: "#004b23",
    chart2: "#006631",
    chart3: "#46664c",
    chart4: "#953d00",
    chart5: "#702c00",

    // Sidebar
    sidebar: "#e1e3e4",
    sidebarForeground: "#191c1d",
    sidebarPrimary: "#004b23",
    sidebarPrimaryForeground: "#ffffff",
    sidebarAccent: "#edeeef",
    sidebarAccentForeground: "#191c1d",
    sidebarBorder: "#bfc9bd",
    sidebarRing: "#004b23",
  },
  dark: {
    background: "#131313",
    foreground: "#e2e2e2",
    card: "#2a2a2a",
    cardForeground: "#e2e2e2",
    popover: "#353535",
    popoverForeground: "#e2e2e2",
    primary: "#84d997",
    primaryForeground: "#003919",
    secondary: "#2a4a30",
    secondaryForeground: "#c8eccb",
    muted: "#1f1f1f",
    mutedForeground: "#bfc9bd",
    accent: "#2a2a2a",
    accentForeground: "#e2e2e2",
    destructive: "#ffb4ab",
    destructiveForeground: "#690005",
    border: "#3f4940",
    input: "#1f1f1f",
    ring: "#84d997",

    // Surface tonal tiers
    surfaceLowest: "#0e0e0e",
    surfaceLow: "#1b1b1b",
    surfaceBase: "#1f1f1f",
    surfaceHigh: "#2a2a2a",
    surfaceHighest: "#353535",
    surfaceBright: "#393939",

    // Heat accent (orange)
    heat: "#ed691f",
    heatForeground: "#4c1a00",
    heatSubtle: "#ffb695",

    // Brand depth
    brand: "#006631",
    brandForeground: "#8be19f",

    // Chart colors
    chart1: "#84d997",
    chart2: "#9ff6b1",
    chart3: "#006631",
    chart4: "#ed691f",
    chart5: "#ffb695",

    // Sidebar
    sidebar: "#0e0e0e",
    sidebarForeground: "#e2e2e2",
    sidebarPrimary: "#84d997",
    sidebarPrimaryForeground: "#003919",
    sidebarAccent: "#2a2a2a",
    sidebarAccentForeground: "#e2e2e2",
    sidebarBorder: "#3f4940",
    sidebarRing: "#84d997",
  },
} as const;

export type ColorScheme = keyof typeof colors;
export type ColorToken = keyof (typeof colors)["light"];
