import { useCallback, useEffect, useMemo } from "react";
import { Platform } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { useTheme } from "@/hooks/useTheme";

/**
 * Roughly UIKit's own fade when a collapsing large title hands over to the
 * small title. Reanimated honours the system Reduce Motion setting by default.
 */
const FADE_MS = 200;

/**
 * A bar title that fades in and out instead of snapping (#395 follow-up).
 *
 * Changing a native title string swaps it instantly, while the tab roots'
 * collapsing large titles fade theirs in. This draws the title itself so it
 * can fade the same way.
 *
 * Returns `headerTitle` for the screen's options and a `setVisible` to call
 * from the scroll handler. The `headerTitle` component only changes with the
 * text, so scrolling never reconfigures the native header — only an opacity
 * on the UI thread moves.
 */
export function useFadingHeaderTitle(text: string): {
  headerTitle: () => React.ReactElement;
  setVisible: (visible: boolean) => void;
} {
  const opacity = useSharedValue(0);

  const setVisible = useCallback(
    (visible: boolean) => {
      opacity.value = withTiming(visible ? 1 : 0, { duration: FADE_MS });
    },
    [opacity],
  );

  // A different team (or the name arriving) starts hidden again.
  useEffect(() => {
    opacity.value = 0;
  }, [text, opacity]);

  const headerTitle = useMemo(
    () =>
      function HeaderTitle() {
        return <FadingTitle text={text} opacity={opacity} />;
      },
    [text, opacity],
  );

  return { headerTitle, setVisible };
}

function FadingTitle({ text, opacity }: { text: string; opacity: SharedValue<number> }) {
  const { colors } = useTheme();
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.Text
      numberOfLines={1}
      accessibilityRole="header"
      style={[
        {
          // The system bar title: SF on iOS, Roboto on Android, in the
          // platform's title metrics — not the brand font, like every other
          // title the native bar draws.
          fontSize: Platform.OS === "ios" ? 17 : 20,
          fontWeight: Platform.OS === "ios" ? "600" : "500",
          color: colors.foreground,
        },
        style,
      ]}
    >
      {text}
    </Animated.Text>
  );
}
