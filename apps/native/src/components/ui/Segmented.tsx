import SegmentedControl from "@react-native-segmented-control/segmented-control";
import { useTheme } from "@/hooks/useTheme";
import { haptics } from "@/lib/haptics";
import { fontFamilies } from "@/theme/typography";

interface SegmentedProps<K extends string> {
  segments: ReadonlyArray<{ key: K; label: string }>;
  selected: K;
  onSelect: (key: K) => void;
}

/**
 * Native segmented control (UISegmentedControl on iOS). Replaces the
 * Pressable-based switchers so VoiceOver support, dark-mode rendering, and
 * platform behavior come from the OS.
 */
export function Segmented<K extends string>({
  segments,
  selected,
  onSelect,
}: SegmentedProps<K>) {
  const { spacing, isDark } = useTheme();
  const selectedIndex = Math.max(
    0,
    segments.findIndex((s) => s.key === selected),
  );

  return (
    <SegmentedControl
      values={segments.map((s) => s.label)}
      selectedIndex={selectedIndex}
      appearance={isDark ? "dark" : "light"}
      fontStyle={{ fontFamily: fontFamilies.body }}
      activeFontStyle={{ fontFamily: fontFamilies.bodySemiBold }}
      style={{ marginBottom: spacing.md }}
      onChange={(event) => {
        const next = segments[event.nativeEvent.selectedSegmentIndex];
        if (next && next.key !== selected) {
          haptics.selection();
          onSelect(next.key);
        }
      }}
    />
  );
}
