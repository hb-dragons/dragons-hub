import { Fragment } from "react";
import { View } from "react-native";
import { useMarkdown, type MarkedStyles } from "react-native-marked";
import { useTheme } from "@/hooks/useTheme";
import { markedStyles } from "@/lib/assistant/marked-styles";

/**
 * The single swap-point for the native markdown renderer. Today: react-native-marked's
 * useMarkdown hook (returns ReactNode[], so no nested FlatList inside the screen list).
 * Future: react-native-streamdown — replace the body, keep the prop.
 */
export function AssistantMarkdown({ text }: { text: string }) {
  const theme = useTheme();
  const elements = useMarkdown(text, {
    colorScheme: theme.isDark ? "dark" : "light",
    // markedStyles never sets the `image` key; cast bridges its wide structural
    // return type to the package's MarkedStyles (whose `image` is ImageStyle).
    styles: markedStyles(theme) as MarkedStyles,
    theme: {
      colors: {
        text: theme.colors.foreground,
        link: theme.colors.primary,
        code: theme.colors.surfaceLow,
        border: theme.colors.border,
        background: "transparent",
      },
    },
  });
  return (
    <View>
      {elements.map((el, i) => (
        <Fragment key={i}>{el}</Fragment>
      ))}
    </View>
  );
}
