import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, Text, TextInput, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { fetch as expoFetch } from "expo/fetch";
import * as Clipboard from "expo-clipboard";
import { Screen } from "@/components/Screen";
import { useTheme } from "@/hooks/useTheme";
import { multilineInput } from "@/components/ui/inputStyles";
import { resolveApiUrl, authClient } from "@/lib/auth-client";
import { i18n } from "@/lib/i18n";
import { buildAssistantTransportConfig } from "@/lib/assistant/transport";
import { messageText, messageSegments } from "@/lib/assistant/messages";
import type { UiMessageLike } from "@/lib/assistant/messages";
import { pickDisplayText } from "@/lib/assistant/stream-throttle";
import { AssistantMarkdown } from "@/components/assistant/AssistantMarkdown";
import { ActivityChip } from "@/components/assistant/ActivityChip";

/** Throttle streamed text to ~100ms so react-native-marked doesn't re-parse on every token. */
function useThrottledText(full: string, isStreaming: boolean): string {
  const [shown, setShown] = useState(full);
  const lastFlush = useRef(0);
  useEffect(() => {
    const next = pickDisplayText({ full, shown, isStreaming, elapsedMs: Date.now() - lastFlush.current });
    if (next !== shown) {
      lastFlush.current = Date.now();
      setShown(next);
    }
  }, [full, isStreaming, shown]);
  return shown;
}

function MessageItem({ message, isStreaming, onRegenerate }: { message: UiMessageLike; isStreaming: boolean; onRegenerate: () => void }) {
  const { colors, spacing, radius, textStyles } = useTheme();
  const full = messageText(message);
  const shown = useThrottledText(full, isStreaming);
  const [copied, setCopied] = useState(false);

  if (message.role === "user") {
    return (
      <View style={{ alignSelf: "flex-end", maxWidth: "80%", backgroundColor: colors.primary, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, marginBottom: spacing.md }}>
        <Text style={[textStyles.body, { color: colors.primaryForeground }]}>{full}</Text>
      </View>
    );
  }

  const toolParts = messageSegments(message).filter((s) => s.kind === "tool");
  const copy = () => {
    void Clipboard.setStringAsync(full);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <View style={{ borderLeftWidth: 2, borderLeftColor: colors.primary, paddingLeft: spacing.md, marginBottom: spacing.md }}>
      {toolParts.map((s, i) => (s.kind === "tool" ? <ActivityChip key={i} part={s.part} /> : null))}
      <AssistantMarkdown text={shown} />
      {!isStreaming && full.length > 0 ? (
        <View style={{ flexDirection: "row", gap: spacing.md, marginTop: spacing.xs }}>
          <Pressable accessibilityRole="button" onPress={copy}>
            <Text style={[textStyles.caption, { color: colors.mutedForeground }]}>{copied ? i18n.t("assistant.copied") : i18n.t("assistant.copy")}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={onRegenerate}>
            <Text style={[textStyles.caption, { color: colors.mutedForeground }]}>{i18n.t("assistant.regenerate")}</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function EmptyState({ onPick }: { onPick: (q: string) => void }) {
  const { colors, spacing, radius, textStyles } = useTheme();
  const examples = i18n.t("assistant.examples") as unknown as string[];
  return (
    <View style={{ gap: spacing.sm, paddingTop: spacing.xl }}>
      <Text style={[textStyles.sectionTitle, { color: colors.foreground }]}>{i18n.t("assistant.greetingTitle")}</Text>
      <Text style={[textStyles.body, { color: colors.mutedForeground }]}>{i18n.t("assistant.greetingSubtitle")}</Text>
      <Text style={[textStyles.label, { color: colors.mutedForeground, marginTop: spacing.sm }]}>{i18n.t("assistant.examplesLabel")}</Text>
      {examples.map((q) => (
        <Pressable key={q} accessibilityRole="button" onPress={() => onPick(q)} style={{ backgroundColor: colors.surfaceLow, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderWidth: 1, borderColor: colors.border }}>
          <Text style={[textStyles.body, { color: colors.foreground }]}>{q}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export default function AssistantScreen() {
  const theme = useTheme();
  const { colors, spacing } = theme;
  const [input, setInput] = useState("");
  const listRef = useRef<FlatList>(null);

  const cfg = buildAssistantTransportConfig({ apiUrl: resolveApiUrl(), cookie: authClient.getCookie(), locale: i18n.locale });
  const { messages, sendMessage, status, error, stop, regenerate } = useChat({
    transport: new DefaultChatTransport({
      api: cfg.api,
      headers: cfg.headers,
      body: cfg.body,
      fetch: expoFetch as unknown as typeof globalThis.fetch,
    }),
  });

  useEffect(() => {
    if (messages.length > 0) listRef.current?.scrollToEnd({ animated: true });
  }, [messages]);

  const send = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    void sendMessage({ text: trimmed });
    setInput("");
  };
  const busy = status === "submitted" || status === "streaming";

  return (
    <Screen scroll={false} edges={[]}>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <FlatList
          ref={listRef}
          style={{ flex: 1 }}
          data={messages as unknown as UiMessageLike[]}
          keyExtractor={(msg) => msg.id}
          ListEmptyComponent={<EmptyState onPick={send} />}
          renderItem={({ item, index }) => (
            <MessageItem
              message={item}
              isStreaming={status === "streaming" && index === messages.length - 1 && item.role === "assistant"}
              onRegenerate={() => void regenerate()}
            />
          )}
        />
        {status === "submitted" ? <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.sm }} /> : null}
        {error ? <Text style={{ color: colors.destructive, marginVertical: spacing.sm }}>{i18n.t("assistant.error")}</Text> : null}
        <View style={{ flexDirection: "row", gap: spacing.sm, alignItems: "flex-end", paddingVertical: spacing.sm }}>
          <TextInput
            value={input}
            onChangeText={setInput}
            multiline
            placeholder={i18n.t("assistant.placeholder")}
            placeholderTextColor={colors.mutedForeground}
            style={[multilineInput(theme), { flex: 1 }]}
          />
          {busy ? (
            <Pressable accessibilityRole="button" onPress={() => void stop()}>
              <Text style={{ color: colors.primary, padding: spacing.sm }}>{i18n.t("assistant.stop")}</Text>
            </Pressable>
          ) : (
            <Pressable accessibilityRole="button" disabled={!input.trim()} onPress={() => send(input)}>
              <Text style={{ color: colors.primary, padding: spacing.sm }}>{i18n.t("assistant.send")}</Text>
            </Pressable>
          )}
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
