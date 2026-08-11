import type { ReactNode } from "react";
import { Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/hooks/useTheme";

/**
 * How the sheet body is laid out, which follows from its detents (see
 * `lib/nav/sheet-routes.ts`):
 *
 * - `"fit"` — a plain View with an intrinsic height, for `fitToContents`
 *   sheets. A flexing root would have no height for the system to measure and
 *   the sheet would collapse.
 * - `"scroll"` — flexing root wrapping a ScrollView, for sheets whose form can
 *   outgrow the smallest detent.
 * - `"fill"` — flexing root, children laid out directly. For a body that
 *   brings its own scroll container (a FlatList), which must not be nested
 *   inside another one.
 */
type SheetLayout = "fit" | "scroll" | "fill";

interface Props {
  /**
   * Drawn in content, because form-sheet routes here run without a native
   * header — see `formSheetOptions` in `lib/nav/sheet-routes.ts`.
   */
  title?: string;
  layout?: SheetLayout;
  /** Pinned below the body (an Apply bar). Not for `"fit"` sheets. */
  footer?: ReactNode;
  testID?: string;
  children: ReactNode;
}

/**
 * Shared body for the board's route sheets: themed background, room for the
 * system grabber, and one place that decides sheet padding.
 */
export function SheetScreen({ title, layout = "fit", footer, testID, children }: Props) {
  const { colors, spacing } = useTheme();
  const insets = useSafeAreaInsets();

  const padding = {
    paddingHorizontal: spacing.lg,
    // Clear of the grabber, which the system draws inside the sheet's top edge.
    paddingTop: spacing.lg,
    // A footer carries the safe-area inset itself, so the body must not.
    paddingBottom: footer ? spacing.md : spacing.lg + insets.bottom,
    gap: spacing.md,
  };

  const heading = title ? (
    <Text style={{ color: colors.foreground, fontSize: 18, fontWeight: "700" }}>{title}</Text>
  ) : null;

  if (layout === "fit") {
    return (
      <View testID={testID} style={{ backgroundColor: colors.background, ...padding }}>
        {heading}
        {children}
      </View>
    );
  }

  return (
    <View testID={testID} style={{ flex: 1, backgroundColor: colors.background }}>
      {layout === "scroll" ? (
        // Keyboard-aware rather than a plain ScrollView: the sheets that
        // scroll are the ones with fields far down the form — a comment
        // composer under a thread, a description under a title (#222) — and
        // nothing else here scrolls a focused field clear of the keyboard.
        // `bottomOffset` is the gap left between the two.
        <KeyboardAwareScrollView
          contentContainerStyle={padding}
          keyboardShouldPersistTaps="handled"
          bottomOffset={spacing.lg}
        >
          {heading}
          {children}
        </KeyboardAwareScrollView>
      ) : (
        <View style={{ flex: 1, ...padding }}>
          {heading}
          {children}
        </View>
      )}
      {footer}
    </View>
  );
}
