import { useState, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { useTheme } from "@/hooks/useTheme";
import { authClient } from "@/lib/auth-client";
import { i18n } from "@/lib/i18n";
import { Wordmark } from "@/components/brand/Wordmark";

export default function SignInScreen() {
  const { colors, textStyles, spacing, radius } = useTheme();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  function dismiss() {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/");
    }
  }

  const canSubmit = useMemo(
    () => email.trim() !== "" && password !== "" && !loading,
    [email, password, loading],
  );

  async function handleSignIn() {
    setErrorText(null);
    setLoading(true);
    try {
      const { error } = await authClient.signIn.email({ email, password });

      if (error) {
        if (error.code === "INVALID_EMAIL_OR_PASSWORD" || error.code === "INVALID_CREDENTIALS") {
          setErrorText(i18n.t("auth.invalidCredentials"));
        } else {
          setErrorText(error.message ?? i18n.t("auth.unknownError"));
        }
        return;
      }

      dismiss();
    } catch (err) {
      setErrorText(
        err instanceof Error ? err.message : i18n.t("auth.unexpectedError"),
      );
    } finally {
      setLoading(false);
    }
  }

  const inputStyle = [
    textStyles.body,
    {
      backgroundColor: colors.input,
      borderWidth: 1 as const,
      borderColor: colors.border + "33",
      borderRadius: radius.md,
      padding: spacing.md,
      color: colors.foreground,
    },
  ];

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <Pressable
        accessibilityLabel={i18n.t("auth.close")}
        accessibilityRole="button"
        disabled={loading}
        hitSlop={12}
        onPress={dismiss}
        style={[
          styles.closeButton,
          { top: spacing.xl, left: spacing.lg, padding: spacing.md },
        ]}
      >
        <Text style={{ color: colors.foreground, fontSize: 22 }}>×</Text>
      </Pressable>

      <View style={[styles.content, { gap: spacing.lg }]}>
        <View
          style={{
            alignItems: "center",
            marginBottom: spacing.xl,
          }}
        >
          <Wordmark width={220} />
        </View>

        <TextInput
          style={inputStyle}
          placeholder={i18n.t("auth.email")}
          placeholderTextColor={colors.mutedForeground}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          value={email}
          onChangeText={setEmail}
          editable={!loading}
          textContentType="emailAddress"
          autoComplete="email"
        />

        <TextInput
          style={inputStyle}
          placeholder={i18n.t("auth.password")}
          placeholderTextColor={colors.mutedForeground}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          editable={!loading}
          textContentType="password"
          autoComplete="current-password"
        />

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
          onPress={handleSignIn}
          disabled={!canSubmit}
          style={[
            {
              backgroundColor: colors.primary,
              borderRadius: radius.md,
              padding: spacing.md,
              alignItems: "center",
              marginTop: spacing.sm,
            },
            !canSubmit && { opacity: 0.4 },
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
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
  },
  content: {
    paddingHorizontal: 24,
  },
  closeButton: {
    position: "absolute",
    zIndex: 1,
  },
});
