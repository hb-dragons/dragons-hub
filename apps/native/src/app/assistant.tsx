import { useEffect, useRef, useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import type { LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent } from "react-native";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { fetch as expoFetch } from "expo/fetch";
import * as Clipboard from "expo-clipboard";
import { useTheme } from "@/hooks/useTheme";
import { resolveApiUrl, authClient } from "@/lib/auth-client";
import { i18n } from "@/lib/i18n";
import { buildAssistantTransportConfig } from "@/lib/assistant/transport";
import { messageText, messageSegments } from "@/lib/assistant/messages";
import type { UiMessageLike } from "@/lib/assistant/messages";
import { pickDisplayText } from "@/lib/assistant/stream-throttle";
import {
  isNearBottom,
  nextFollowScroll,
  shouldReArmFollow,
  countUserMessages,
  NEAR_BOTTOM,
} from "@/lib/assistant/scroll";
import { AssistantMarkdown } from "@/components/assistant/AssistantMarkdown";
import { ActivityChip } from "@/components/assistant/ActivityChip";
import { ChatComposer } from "@/components/assistant/ChatComposer";

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
  const { colors, spacing } = useTheme();
  const [input, setInput] = useState("");
  const [composerH, setComposerH] = useState(0);
  const listRef = useRef<FlatList>(null);
  const autoFollow = useRef(true);
  const contentH = useRef(0);
  const lastUserCount = useRef(0);

  const cfg = buildAssistantTransportConfig({ apiUrl: resolveApiUrl(), cookie: authClient.getCookie(), locale: i18n.locale });
  const { messages, sendMessage, status, error, stop, regenerate } = useChat({
    transport: new DefaultChatTransport({
      api: cfg.api,
      headers: cfg.headers,
      body: cfg.body,
      fetch: expoFetch as unknown as typeof globalThis.fetch,
    }),
  });

  const scrollToBottom = (animated: boolean) => {
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated }));
  };

  // Re-arm auto-follow and scroll on the user's own send, not on every token.
  useEffect(() => {
    const userCount = countUserMessages(messages as unknown as UiMessageLike[]);
    if (shouldReArmFollow(userCount, lastUserCount.current)) {
      autoFollow.current = true;
      scrollToBottom(true);
    }
    lastUserCount.current = userCount;
  }, [messages]);

  const send = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    void sendMessage({ text: trimmed });
    setInput("");
  };
  const busy = status === "submitted" || status === "streaming";

  const onListScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    autoFollow.current = isNearBottom({
      contentOffsetY: contentOffset.y,
      contentHeight: contentSize.height,
      layoutHeight: layoutMeasurement.height,
      threshold: NEAR_BOTTOM,
    });
  };

  return (
    // Full-bleed (no Screen content padding) so the floating composer can dock
    // at the bottom edge; the message list keeps its horizontal inset via
    // contentContainerStyle. Screen here would only add unwanted content
    // padding (its SafeAreaView is a no-op with edges={[]}); the top is handled
    // by the native Stack header.
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <FlatList
        ref={listRef}
        style={{ flex: 1 }}
        data={messages as unknown as UiMessageLike[]}
        keyExtractor={(msg) => msg.id}
        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: composerH + spacing.sm }}
        ListEmptyComponent={<EmptyState onPick={send} />}
        renderItem={({ item, index }) => (
          <MessageItem
            message={item}
            isStreaming={status === "streaming" && index === messages.length - 1 && item.role === "assistant"}
            onRegenerate={() => void regenerate()}
          />
        )}
        onContentSizeChange={(_w, h) => {
          const { scroll } = nextFollowScroll({
            prevHeight: contentH.current,
            nextHeight: h,
            autoFollow: autoFollow.current,
          });
          contentH.current = h;
          if (scroll) scrollToBottom(false);
        }}
        onScroll={onListScroll}
        scrollEventThrottle={16}
        maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
      />
      <KeyboardStickyView style={{ position: "absolute", left: 0, right: 0, bottom: 0 }}>
        <View onLayout={(e: LayoutChangeEvent) => setComposerH(e.nativeEvent.layout.height)}>
          {error ? (
            <Text
              style={{
                color: colors.destructive,
                textAlign: "center",
                paddingHorizontal: spacing.lg,
                paddingBottom: spacing.xs,
              }}
            >
              {i18n.t("assistant.error")}
            </Text>
          ) : null}
          <ChatComposer
            value={input}
            onChangeText={setInput}
            onSend={() => send(input)}
            busy={busy}
            onStop={() => void stop()}
          />
        </View>
      </KeyboardStickyView>
    </View>
  );
}
