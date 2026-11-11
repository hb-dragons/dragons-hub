import { useEffect, useState, useMemo, useRef } from "react";
import type { LayoutChangeEvent } from "react-native";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useRouter } from "expo-router";
import { useTheme } from "@/hooks/useTheme";
import { authClient } from "@/lib/auth-client";
import { i18n } from "@/lib/i18n";
import { TEXT_LINK_SLOP } from "@/lib/ui/a11y";
import { Wordmark } from "@/components/brand/Wordmark";
import { LEGAL_LINKS } from "@/lib/legal/links";
import { openExternal } from "@/lib/legal/open-external";
import { dismissModalTo } from "@/lib/nav/dismiss-modal";
import { submitClearance } from "@/lib/auth/submit-clearance";

/** Height of the two fields and the button. */
const CONTROL_HEIGHT = 48;

type Field = "email" | "password";
/** Bottom edges inside the scroll content, from `onLayout`; 0 until measured. */
type Bottoms = Record<Field | "button", number>;

const bottomOf = (event: LayoutChangeEvent) => event.nativeEvent.layout.y + event.nativeEvent.layout.height;

/**
 * Sign-in (#396). A page sheet: the stack's header carries the title and the
 * Close button (`(auth)/_layout.tsx`), and swiping down closes it too, so the
 * screen draws neither. A successful sign-in closes the sheet and lands on
 * Today.
 */
export default function SignInScreen() {
  const { colors, textStyles, spacing, radius, fontFamilies } = useTheme();
  const router = useRouter();
  const passwordRef = useRef<TextInput>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [focused, setFocused] = useState<Field>("email");
  const [bottoms, setBottoms] = useState<Bottoms>({ email: 0, password: 0, button: 0 });
  const measure = (key: keyof Bottoms) => (event: LayoutChangeEvent) => {
    const bottom = bottomOf(event);
    setBottoms((prev) => (prev[key] === bottom ? prev : { ...prev, [key]: bottom }));
  };

  // The header Close and the swipe stay live during a request. A sheet closed
  // mid-request must not navigate when the answer arrives: the session is
  // signed in either way, and the shell reshapes around it.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const canSubmit = useMemo(
    () => email.trim() !== "" && password !== "" && !loading,
    [email, password, loading],
  );

  async function handleSignIn() {
    if (!canSubmit) return;
    setErrorText(null);
    setLoading(true);
    try {
      const { error } = await authClient.signIn.email({ email, password });
      if (!mounted.current) return;

      if (error) {
        if (error.code === "INVALID_EMAIL_OR_PASSWORD" || error.code === "INVALID_CREDENTIALS") {
          setErrorText(i18n.t("auth.invalidCredentials"));
        } else {
          setErrorText(error.message ?? i18n.t("auth.unknownError"));
        }
        return;
      }

      dismissModalTo(router, "/today");
    } catch (err) {
      if (!mounted.current) return;
      setErrorText(
        err instanceof Error ? err.message : i18n.t("auth.unexpectedError"),
      );
    } finally {
      if (mounted.current) setLoading(false);
    }
  }

  // Note: do NOT spread `textStyles.body` onto TextInput — its `lineHeight`
  // clips descenders (g, j, p, q, y) in single-line inputs on iOS. Use
  // explicit font + size only, with generous vertical padding.
  const inputStyle = {
    fontFamily: fontFamilies.body,
    fontSize: 16,
    backgroundColor: colors.input,
    borderWidth: 1 as const,
    borderColor: colors.border + "33",
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    minHeight: CONTROL_HEIGHT,
    color: colors.foreground,
  };
  const labelStyle = [textStyles.label, { color: colors.foreground, marginBottom: spacing.xs }];

  return (
    // Keyboard-aware, with an offset measured from the focused field down to
    // the button, so the keyboard covers neither on a small phone.
    <KeyboardAwareScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{ gap: spacing.lg, paddingHorizontal: spacing.xl, paddingVertical: spacing.xl }}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      bottomOffset={submitClearance({
        fieldBottom: bottoms[focused],
        buttonBottom: bottoms.button,
        gap: spacing.lg,
      })}
    >
      <View
        style={{
          alignItems: "center",
          marginBottom: spacing.xl,
        }}
      >
        <Wordmark width={220} />
      </View>

      <View onLayout={measure("email")}>
        <Text style={labelStyle}>{i18n.t("auth.email")}</Text>
        <TextInput
          style={inputStyle}
          accessibilityLabel={i18n.t("auth.email")}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          value={email}
          onChangeText={setEmail}
          editable={!loading}
          // The account name AutoFill pairs with the password; RN maps it to
          // iOS's `username` content type. One hint per field (#396).
          autoComplete="username"
          returnKeyType="next"
          submitBehavior="submit"
          onFocus={() => setFocused("email")}
          onSubmitEditing={() => passwordRef.current?.focus()}
        />
      </View>

      <View onLayout={measure("password")}>
        <Text style={labelStyle}>{i18n.t("auth.password")}</Text>
        <TextInput
          ref={passwordRef}
          style={inputStyle}
          accessibilityLabel={i18n.t("auth.password")}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          editable={!loading}
          autoComplete="current-password"
          returnKeyType="go"
          onFocus={() => setFocused("password")}
          onSubmitEditing={() => { void handleSignIn(); }}
        />
      </View>

      {errorText ? (
        <Text
          style={[textStyles.body, { color: colors.destructive }]}
          accessibilityLiveRegion="polite"
          accessibilityRole="alert"
        >
          {errorText}
        </Text>
      ) : null}

      <Pressable
        onPress={() => { void handleSignIn(); }}
        disabled={!canSubmit}
        accessibilityRole="button"
        // The spinner that replaces the text while signing in reads as
        // nothing, so the label is explicit.
        accessibilityLabel={i18n.t("auth.signIn")}
        accessibilityState={{ busy: loading }}
        onLayout={measure("button")}
        style={({ pressed }) => [
          {
            backgroundColor: colors.primary,
            borderRadius: radius.md,
            paddingVertical: spacing.md,
            paddingHorizontal: spacing.md,
            alignItems: "center",
            justifyContent: "center",
            minHeight: CONTROL_HEIGHT,
            marginTop: spacing.sm,
          },
          !canSubmit && { opacity: 0.4 },
          canSubmit && pressed && { opacity: 0.85 },
        ]}
      >
        {loading ? (
          <ActivityIndicator color={colors.primaryForeground} />
        ) : (
          <Text style={[textStyles.button, { color: colors.primaryForeground }]}>
            {i18n.t("auth.signIn")}
          </Text>
        )}
      </Pressable>

      <Text
        style={[
          textStyles.caption,
          {
            color: colors.mutedForeground,
            textAlign: "center",
            marginTop: spacing.sm,
          },
        ]}
      >
        {i18n.t("auth.noAccountHint")}
      </Text>

      {/* Legal links reachable before sign-in (#233). */}
      <View
        style={{
          flexDirection: "row",
          justifyContent: "center",
          alignItems: "center",
          gap: spacing.md,
          marginTop: spacing.lg,
        }}
      >
        <Pressable
          accessibilityRole="link"
          hitSlop={TEXT_LINK_SLOP}
          onPress={() => openExternal(LEGAL_LINKS.privacy)}
        >
          <Text style={[textStyles.caption, { color: colors.mutedForeground }]}>
            {i18n.t("legal.privacy")}
          </Text>
        </Pressable>
        <Text style={[textStyles.caption, { color: colors.mutedForeground }]}>·</Text>
        <Pressable
          accessibilityRole="link"
          hitSlop={TEXT_LINK_SLOP}
          onPress={() => openExternal(LEGAL_LINKS.imprint)}
        >
          <Text style={[textStyles.caption, { color: colors.mutedForeground }]}>
            {i18n.t("legal.imprint")}
          </Text>
        </Pressable>
      </View>
    </KeyboardAwareScrollView>
  );
}

