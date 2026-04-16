/**
 * Dragon's Lair typography tokens for React Native.
 *
 * Display/Headlines: Space Grotesk
 * Body/Data: Inter
 */
import type { TextStyle } from "react-native";

/**
 * Semantic font family names mapped to loaded font asset names.
 * These keys are what you pass to `fontFamily` in styles.
 */
export const fontFamilies = {
  display: "SpaceGrotesk-Bold",
  displayMedium: "SpaceGrotesk-Medium",
  body: "Inter-Regular",
  bodyMedium: "Inter-Medium",
  bodySemiBold: "Inter-SemiBold",
} as const;

/**
 * Font assets for expo-font loading.
 * Pass this object to `Font.loadAsync()` or `useFonts()`.
 *
 * NOTE: The require() calls will fail typecheck until the actual .ttf files
 * are present in assets/fonts/. This is expected during initial scaffolding.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
export const fontAssets = {
  [fontFamilies.display]: require("../../assets/fonts/SpaceGrotesk-Bold.ttf"),
  [fontFamilies.displayMedium]: require("../../assets/fonts/SpaceGrotesk-Medium.ttf"),
  [fontFamilies.body]: require("../../assets/fonts/Inter-Regular.ttf"),
  [fontFamilies.bodyMedium]: require("../../assets/fonts/Inter-Medium.ttf"),
  [fontFamilies.bodySemiBold]: require("../../assets/fonts/Inter-SemiBold.ttf"),
} as const;

/**
 * Predefined text styles matching the Dragon's Lair design system.
 */
export const textStyles = {
  screenTitle: {
    fontFamily: fontFamilies.display,
    fontSize: 28,
    lineHeight: 34,
    textTransform: "uppercase",
    letterSpacing: -0.5,
  } satisfies TextStyle,

  sectionTitle: {
    fontFamily: fontFamilies.display,
    fontSize: 18,
    lineHeight: 24,
    textTransform: "uppercase",
    letterSpacing: -0.3,
  } satisfies TextStyle,

  cardTitle: {
    fontFamily: fontFamilies.display,
    fontSize: 16,
    lineHeight: 22,
  } satisfies TextStyle,

  score: {
    fontFamily: fontFamilies.display,
    fontSize: 36,
    lineHeight: 42,
  } satisfies TextStyle,

  stat: {
    fontFamily: fontFamilies.display,
    fontSize: 24,
    lineHeight: 30,
  } satisfies TextStyle,

  body: {
    fontFamily: fontFamilies.body,
    fontSize: 15,
    lineHeight: 22,
  } satisfies TextStyle,

  caption: {
    fontFamily: fontFamilies.body,
    fontSize: 13,
    lineHeight: 18,
  } satisfies TextStyle,

  label: {
    fontFamily: fontFamilies.displayMedium,
    fontSize: 11,
    lineHeight: 14,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  } satisfies TextStyle,

  tableHeader: {
    fontFamily: fontFamilies.displayMedium,
    fontSize: 11,
    lineHeight: 14,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  } satisfies TextStyle,

  button: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: 15,
    lineHeight: 22,
  } satisfies TextStyle,

  tabLabel: {
    fontFamily: fontFamilies.displayMedium,
    fontSize: 10,
    lineHeight: 14,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  } satisfies TextStyle,
} as const;
