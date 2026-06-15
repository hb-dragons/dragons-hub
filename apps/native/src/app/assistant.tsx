import { useState } from "react";
import { View, Text, TextInput, Pressable, FlatList } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { fetch as expoFetch } from "expo/fetch";
import { Screen } from "@/components/Screen";
import { useTheme } from "@/hooks/useTheme";
import { multilineInput } from "@/components/ui/inputStyles";
import { resolveApiUrl, authClient } from "@/lib/auth-client";
import { i18n } from "@/lib/i18n";
import { buildAssistantTransportConfig } from "@/lib/assistant/transport";
import { messageText } from "@/lib/assistant/messages";
import type { UiMessageLike } from "@/lib/assistant/messages";

export default function AssistantScreen() {
  const theme = useTheme();
  const { colors, spacing, radius } = theme;
  const [input, setInput] = useState("");

  const cfg = buildAssistantTransportConfig({
    apiUrl: resolveApiUrl(),
    cookie: authClient.getCookie(),
    locale: i18n.locale,
  });
  const { messages, sendMessage, status, error } = useChat({
    transport: new DefaultChatTransport({
      api: cfg.api,
      headers: cfg.headers,
      body: cfg.body,
      fetch: expoFetch as unknown as typeof globalThis.fetch,
    }),
  });

  return (
    <Screen scroll={false} edges={[]}>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <FlatList
          style={{ flex: 1 }}
          data={messages}
          keyExtractor={(msg) => msg.id}
          ListEmptyComponent={<Text style={{ color: colors.mutedForeground }}>{i18n.t("assistant.empty")}</Text>}
          renderItem={({ item }) => (
            <View style={{ backgroundColor: colors.surfaceLow, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm }}>
              <Text style={{ color: colors.foreground }}>{messageText(item as UiMessageLike)}</Text>
            </View>
          )}
        />
        {error ? <Text style={{ color: colors.destructive }}>{i18n.t("assistant.error")}</Text> : null}
        <View style={{ flexDirection: "row", gap: spacing.sm, alignItems: "flex-end", paddingVertical: spacing.sm }}>
          <TextInput
            value={input}
            onChangeText={setInput}
            multiline
            placeholder={i18n.t("assistant.placeholder")}
            placeholderTextColor={colors.mutedForeground}
            style={[multilineInput(theme), { flex: 1 }]}
          />
          <Pressable
            accessibilityRole="button"
            disabled={status !== "ready" || !input.trim()}
            onPress={() => {
              if (input.trim()) {
                void sendMessage({ text: input });
                setInput("");
              }
            }}
          >
            <Text style={{ color: colors.primary, padding: spacing.sm }}>{i18n.t("assistant.send")}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
