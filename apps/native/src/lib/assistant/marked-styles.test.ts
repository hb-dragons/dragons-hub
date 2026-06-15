import { describe, expect, it } from "vitest";
import { markedStyles } from "./marked-styles";
import { colors } from "@/theme/colors";
import { spacing, radius } from "@/theme/spacing";

// Inline the slice of typography markedStyles reads. Importing
// @/theme/typography pulls in fontAssets, whose top-level require()s of binary
// .ttf files can't be parsed by vitest's node transform.
const textStyles = { body: { fontSize: 15 } } as never;

const theme = { colors: colors.dark, textStyles, spacing, radius, isDark: true, mode: "dark" as const, setMode: () => {} };

describe("markedStyles", () => {
  it("maps theme tokens onto markdown elements", () => {
    const s = markedStyles(theme);
    expect(s.text!.color).toBe(colors.dark.foreground);
    expect(s.link!.color).toBe(colors.dark.primary);
    expect(s.strong!.fontFamily).toBe("Inter-SemiBold");
    expect(s.code!.backgroundColor).toBe(colors.dark.surfaceLow);
  });
});
