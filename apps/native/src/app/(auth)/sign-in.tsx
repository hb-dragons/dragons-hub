import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  Alert,
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { useTheme } from "@/hooks/useTheme";
import { authClient } from "@/lib/auth-client";
import { i18n } from "@/lib/i18n";

export default function SignInScreen() {
  const { colors, textStyles, spacing, radius } = useTheme();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSignIn() {
    if (!email || !password) {
      Alert.alert(i18n.t("auth.error"), i18n.t("auth.fillAllFields"));
      return;
    }

    setLoading(true);
    try {
      const { error } = await authClient.signIn.email({
        email,
        password,
      });

      if (error) {
        Alert.alert(i18n.t("auth.signInFailed"), error.message ?? i18n.t("auth.unknownError"));
        return;
      }

      router.dismissAll();
      router.replace("/");
    } catch (err) {
      Alert.alert(
        i18n.t("auth.signInFailed"),
        err instanceof Error ? err.message : i18n.t("auth.unexpectedError"),
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={[styles.content, { gap: spacing.lg }]}>
        <Text
          style={[
            textStyles.screenTitle,
            { color: colors.foreground, textAlign: "center", marginBottom: spacing.xl },
          ]}
        >
          DRAGONS
        </Text>

        <TextInput
          style={[
            textStyles.body,
            {
              backgroundColor: colors.input,
              borderWidth: 1,
              borderColor: colors.border + "33",
              borderRadius: radius.md,
              padding: spacing.md,
              color: colors.foreground,
            },
          ]}
          placeholder={i18n.t("auth.email")}
          placeholderTextColor={colors.mutedForeground}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          value={email}
          onChangeText={setEmail}
          editable={!loading}
        />

        <TextInput
          style={[
            textStyles.body,
            {
              backgroundColor: colors.input,
              borderWidth: 1,
              borderColor: colors.border + "33",
              borderRadius: radius.md,
              padding: spacing.md,
              color: colors.foreground,
            },
          ]}
          placeholder={i18n.t("auth.password")}
          placeholderTextColor={colors.mutedForeground}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          editable={!loading}
        />

        <Pressable
          onPress={handleSignIn}
          disabled={loading}
          style={[
            {
              backgroundColor: colors.primary,
              borderRadius: radius.md,
              padding: spacing.md,
              alignItems: "center",
              marginTop: spacing.sm,
            },
            loading && { opacity: 0.6 },
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

        <Pressable
          onPress={() => router.push("/(auth)/sign-up")}
          style={{ alignItems: "center", marginTop: spacing.sm }}
          disabled={loading}
        >
          <Text style={[textStyles.body, { color: colors.primary }]}>
            {i18n.t("auth.noAccount")}{" "}
            <Text style={{ fontWeight: "600" }}>{i18n.t("auth.signUp")}</Text>
          </Text>
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
});
