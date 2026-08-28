/**
 * Dragon's Lair typography tokens for React Native.
 *
 * One family for everything: Bricolage Grotesque, the public site's face
 * (see apps/site/astro.config.mjs) — display and body roles differ by
 * weight, not family. Static instances, not the variable font: RN's
 * Android renderer has no reliable fontVariationSettings support.
 */
import type { TextStyle } from "react-native";
import { fontFamilies } from "./font-families";

export { fontFamilies };

/**
 * Font assets for expo-font loading.
 * Pass this object to `Font.loadAsync()` or `useFonts()`.
 */
export const fontAssets = {
  "BricolageGrotesque-Regular": require("../../assets/fonts/BricolageGrotesque-Regular.ttf"),
  "BricolageGrotesque-Medium": require("../../assets/fonts/BricolageGrotesque-Medium.ttf"),
  "BricolageGrotesque-SemiBold": require("../../assets/fonts/BricolageGrotesque-SemiBold.ttf"),
  "BricolageGrotesque-Bold": require("../../assets/fonts/BricolageGrotesque-Bold.ttf"),
} as const satisfies Record<(typeof fontFamilies)[keyof typeof fontFamilies], unknown>;

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
