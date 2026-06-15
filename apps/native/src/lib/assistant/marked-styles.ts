import type { TextStyle, ViewStyle } from "react-native";
import type { useTheme } from "@/hooks/useTheme";

type Theme = ReturnType<typeof useTheme>;

// Structural type matching react-native-marked's MarkedStyles keys we set.
type Styles = Partial<
  Record<
    | "text"
    | "paragraph"
    | "strong"
    | "em"
    | "strikethrough"
    | "link"
    | "blockquote"
    | "h1"
    | "h2"
    | "h3"
    | "h4"
    | "h5"
    | "h6"
    | "codespan"
    | "code"
    | "hr"
    | "list"
    | "li"
    | "image"
    | "table"
    | "tableRow"
    | "tableCell",
    TextStyle & ViewStyle
  >
>;

export function markedStyles(theme: Theme): Styles {
  const { colors, spacing, radius, textStyles } = theme;
  const heading = (fontSize: number): TextStyle => ({
    color: colors.foreground,
    fontFamily: "SpaceGrotesk-Bold",
    fontSize,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  });
  return {
    text: { color: colors.foreground, fontFamily: "Inter-Regular", fontSize: textStyles.body.fontSize },
    paragraph: { marginTop: spacing.xs, marginBottom: spacing.xs },
    strong: { fontFamily: "Inter-SemiBold", color: colors.foreground },
    em: { fontStyle: "italic" },
    strikethrough: { textDecorationLine: "line-through" },
    link: { color: colors.primary, textDecorationLine: "underline" },
    blockquote: { borderLeftWidth: 2, borderLeftColor: colors.primary, paddingLeft: spacing.md },
    h1: heading(22),
    h2: heading(18),
    h3: heading(16),
    h4: heading(15),
    h5: heading(14),
    h6: heading(13),
    codespan: {
      backgroundColor: colors.surfaceLow,
      color: colors.foreground,
      borderRadius: radius.md,
      paddingHorizontal: spacing.xs,
    },
    code: { backgroundColor: colors.surfaceLow, color: colors.foreground, padding: spacing.md, borderRadius: radius.md },
    hr: { backgroundColor: colors.border, height: 1, marginVertical: spacing.sm },
    list: { marginTop: spacing.xs, marginBottom: spacing.xs },
    li: { color: colors.foreground },
    table: { borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, marginVertical: spacing.sm },
    tableRow: { borderColor: colors.border },
    tableCell: { padding: spacing.sm },
  };
}
