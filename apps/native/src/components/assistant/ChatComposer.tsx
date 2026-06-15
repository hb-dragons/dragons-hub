import { useEffect, useState } from "react";
import { Platform, Pressable, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/hooks/useTheme";
import { i18n } from "@/lib/i18n";
import {
  clampComposerHeight,
  composerButtonState,
  COMPOSER_MIN,
  COMPOSER_MAX,
} from "@/lib/assistant/composer";
import { ComposerSurface } from "./ComposerSurface";
import { ArrowUpIcon, StopIcon } from "./icons";

export function ChatComposer({
  value,
  onChangeText,
  onSend,
  busy,
  onStop,
}: {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  busy: boolean;
  onStop: () => void;
}) {
  const { colors, spacing, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const [height, setHeight] = useState(COMPOSER_MIN);
  const state = composerButtonState(busy, value);

  // Clearing the text (incl. after send) does not reliably refire
  // onContentSizeChange, so reset the grown height explicitly.
  useEffect(() => {
    if (value.length === 0) setHeight(COMPOSER_MIN);
  }, [value]);

  const handlePress = () => {
    if (state === "stop") onStop();
    else if (state === "send") onSend();
  };

  const fill = state === "disabled" ? colors.surfaceHigh : colors.primary;
  const iconColor = state === "disabled" ? colors.mutedForeground : colors.primaryForeground;
  const label = state === "stop" ? i18n.t("assistant.stop") : i18n.t("assistant.send");

  return (
    <View
      style={{
        paddingHorizontal: spacing.md,
        paddingTop: spacing.sm,
        paddingBottom: Math.max(insets.bottom, spacing.sm),
      }}
    >
      <ComposerSurface>
        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-end",
            gap: spacing.sm,
            padding: spacing.xs,
          }}
        >
          <TextInput
            value={value}
            onChangeText={onChangeText}
            multiline
            scrollEnabled={height >= COMPOSER_MAX}
            onContentSizeChange={(e) =>
              setHeight(clampComposerHeight(e.nativeEvent.contentSize.height))
            }
            placeholder={i18n.t("assistant.placeholder")}
            placeholderTextColor={colors.mutedForeground}
            style={{
              flex: 1,
              height,
              color: colors.foreground,
              fontSize: 15,
              paddingHorizontal: spacing.sm,
              paddingTop: Platform.OS === "ios" ? 10 : 8,
              paddingBottom: Platform.OS === "ios" ? 10 : 8,
              textAlignVertical: "top",
              // NOTE: lineHeight intentionally omitted — setting it on a multiline
              // TextInput corrupts the auto-grow contentSize.height on iOS.
            }}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ disabled: state === "disabled" }}
            disabled={state === "disabled"}
            onPress={handlePress}
            style={{
              width: 36,
              height: 36,
              borderRadius: radius.pill,
              backgroundColor: fill,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {state === "stop" ? <StopIcon color={iconColor} /> : <ArrowUpIcon color={iconColor} />}
          </Pressable>
        </View>
      </ComposerSurface>
    </View>
  );
}
