import { Pressable, Text, View } from "react-native";
import { Stack } from "expo-router";
import { useTheme } from "@/hooks/useTheme";
import { i18n } from "@/lib/i18n";
import { Icon } from "@/components/ui/Icon";
import { BAR_DRAWS_ITEMS, FALLBACK_TAP_TARGET } from "@/components/nav/HeaderActions";
import { symbolFor } from "@/lib/ui/icons";
import type { ProfileAffordance } from "@/lib/nav/viewer-chrome";
import { fontFamilies } from "@/theme/typography";

const AVATAR_SIZE = 32;

interface Options {
  affordance: ProfileAffordance;
  /** The staff member's initial; ignored for the sign-in affordance. */
  initial: string;
  onPress: () => void;
}

/**
 * The account entry point at the trailing edge of a tab root's bar (#395).
 *
 * A function returning the `Stack.Toolbar` element rather than a component,
 * because it is placed from a layout as a child of `Stack.Screen`, and
 * expo-router only reads toolbar children there whose element type *is*
 * `Stack.Toolbar` — a wrapper component would be silently dropped. That is
 * also why this does not go through `HeaderActions`, which is a component.
 * It follows the same platform split, read from the same flag: a
 * `UIBarButtonItem` on iOS, a hosted pressable on Android (ADR 0001).
 */
export function profileToolbar({ affordance, initial, onPress }: Options) {
  if (affordance === "sign-in") {
    return BAR_DRAWS_ITEMS ? (
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          icon={symbolFor("account")}
          accessibilityLabel={i18n.t("auth.signIn")}
          onPress={onPress}
        />
      </Stack.Toolbar>
    ) : (
      <Stack.Toolbar placement="right" asChild>
        <SignInButton onPress={onPress} />
      </Stack.Toolbar>
    );
  }

  const avatar = <Avatar initial={initial} onPress={onPress} />;
  return BAR_DRAWS_ITEMS ? (
    <Stack.Toolbar placement="right">
      {/* The avatar is its own disc, as in Apple's tab-based apps, so it
          does not also sit inside the bar's glass pill. */}
      <Stack.Toolbar.View hidesSharedBackground>{avatar}</Stack.Toolbar.View>
    </Stack.Toolbar>
  ) : (
    <Stack.Toolbar placement="right" asChild>
      {avatar}
    </Stack.Toolbar>
  );
}

function SignInButton({ onPress }: { onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={i18n.t("auth.signIn")}
      style={{ width: FALLBACK_TAP_TARGET, height: FALLBACK_TAP_TARGET, alignItems: "center", justifyContent: "center" }}
    >
      <Icon name="account" size={24} color={colors.primary} />
    </Pressable>
  );
}

function Avatar({ initial, onPress }: { initial: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={i18n.t("profile.title")}
      style={{ width: FALLBACK_TAP_TARGET, height: FALLBACK_TAP_TARGET, alignItems: "center", justifyContent: "center" }}
    >
      <View
        style={{
          width: AVATAR_SIZE,
          height: AVATAR_SIZE,
          borderRadius: AVATAR_SIZE / 2,
          backgroundColor: colors.primary,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {initial ? (
        <Text
          // The disc is fixed to the bar's height, so its letter cannot grow
          // with the text size the way content does.
          maxFontSizeMultiplier={1}
          style={{
            color: colors.primaryForeground,
            fontSize: 15,
            fontFamily: fontFamilies.bodySemiBold,
          }}
        >
          {initial}
        </Text>
        ) : (
          // A session with no name still gets a recognisable disc.
          <Icon name="account" size={20} color={colors.primaryForeground} />
        )}
      </View>
    </Pressable>
  );
}

/**
 * Profile's Done button (#398): the trailing bar item that closes the sheet,
 * as on every iOS page sheet. A function for the same reason as
 * `profileToolbar`: it is placed from the Profile stack's layout. iOS draws a
 * `UIBarButtonItem` in the done style; Android hosts a plain text button.
 */
export function doneToolbar(onPress: () => void) {
  return BAR_DRAWS_ITEMS ? (
    <Stack.Toolbar placement="right">
      <Stack.Toolbar.Button variant="done" onPress={onPress}>
        {i18n.t("common.done")}
      </Stack.Toolbar.Button>
    </Stack.Toolbar>
  ) : (
    <Stack.Toolbar placement="right" asChild>
      <DoneButton onPress={onPress} />
    </Stack.Toolbar>
  );
}

function DoneButton({ onPress }: { onPress: () => void }) {
  const { colors, textStyles, spacing } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={{ minHeight: FALLBACK_TAP_TARGET, paddingHorizontal: spacing.sm, justifyContent: "center" }}
    >
      <Text style={[textStyles.button, { color: colors.primary }]}>{i18n.t("common.done")}</Text>
    </Pressable>
  );
}

/**
 * The Close button of a page sheet that has nothing to confirm (#396):
 * sign-in and the assistant. Leading, as an `xmark` bar item on iOS, the way
 * system sheets place it; Done stays the trailing item of a sheet that is a
 * finished place, like Profile. Android hosts a plain icon button.
 */
export function closeToolbar(onPress: () => void) {
  return BAR_DRAWS_ITEMS ? (
    <Stack.Toolbar placement="left">
      <Stack.Toolbar.Button
        icon={symbolFor("close")}
        accessibilityLabel={i18n.t("common.close")}
        onPress={onPress}
      />
    </Stack.Toolbar>
  ) : (
    <Stack.Toolbar placement="left" asChild>
      <CloseButton onPress={onPress} />
    </Stack.Toolbar>
  );
}

function CloseButton({ onPress }: { onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={i18n.t("common.close")}
      style={{ width: FALLBACK_TAP_TARGET, height: FALLBACK_TAP_TARGET, alignItems: "center", justifyContent: "center" }}
    >
      <Icon name="close" size={22} color={colors.foreground} />
    </Pressable>
  );
}
