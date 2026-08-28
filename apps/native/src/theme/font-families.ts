/**
 * Semantic font family names mapped to loaded font asset names.
 * These keys are what you pass to `fontFamily` in styles.
 *
 * Kept separate from typography.ts so modules (and their vitest tests) can
 * import the names without pulling in fontAssets, whose top-level require()s
 * of binary .ttf files can't be parsed by vitest's node transform.
 */
export const fontFamilies = {
  display: "BricolageGrotesque-Bold",
  displayMedium: "BricolageGrotesque-Medium",
  body: "BricolageGrotesque-Regular",
  bodyMedium: "BricolageGrotesque-Medium",
  bodySemiBold: "BricolageGrotesque-SemiBold",
} as const;
