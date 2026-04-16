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

export default function SignUpScreen() {
  const { colors, textStyles, spacing, radius } = useTheme();
  const router = useRouter();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSignUp() {
    if (!name || !email || !password) {
      Alert.alert("Error", "Please fill in all fields.");
      return;
    }

    setLoading(true);
    try {
      const { error } = await authClient.signUp.email({
        name,
        email,
        password,
      });

      if (error) {
        Alert.alert("Sign Up Failed", error.message ?? "Unknown error");
        return;
      }

      router.dismissAll();
      router.replace("/");
    } catch (err) {
      Alert.alert(
        "Sign Up Failed",
        err instanceof Error ? err.message : "An unexpected error occurred",
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
          style={inputStyle}
          placeholder="Name"
          placeholderTextColor={colors.mutedForeground}
          autoCapitalize="words"
          value={name}
          onChangeText={setName}
          editable={!loading}
        />

        <TextInput
          style={inputStyle}
          placeholder="Email"
          placeholderTextColor={colors.mutedForeground}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          value={email}
          onChangeText={setEmail}
          editable={!loading}
        />

        <TextInput
          style={inputStyle}
          placeholder="Password"
          placeholderTextColor={colors.mutedForeground}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          editable={!loading}
        />

        <Pressable
          onPress={handleSignUp}
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
              Sign Up
            </Text>
          )}
        </Pressable>

        <Pressable
          onPress={() => router.back()}
          style={{ alignItems: "center", marginTop: spacing.sm }}
          disabled={loading}
        >
          <Text style={[textStyles.body, { color: colors.primary }]}>
            Already have an account?{" "}
            <Text style={{ fontWeight: "600" }}>Sign In</Text>
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
