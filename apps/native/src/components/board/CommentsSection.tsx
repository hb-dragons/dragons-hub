import { useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { BottomSheetTextInput } from "@gorhom/bottom-sheet";
import type { TaskDetail } from "@dragons/shared";
import { useCommentMutations } from "@/hooks/board/useCommentMutations";
import { authClient } from "@/lib/auth-client";
import { useTheme } from "@/hooks/useTheme";
import { useToast } from "@/hooks/useToast";
import { i18n } from "@/lib/i18n";
import { haptics } from "@/lib/haptics";
import { adminBoardApi } from "@/lib/api";

interface Props {
  task: TaskDetail;
}

export function CommentsSection({ task }: Props) {
  const { colors, spacing, radius } = useTheme();
  const { data: session } = authClient.useSession();
  const currentUserId = session?.user?.id ?? null;
  const mutations = useCommentMutations();
  const toast = useToast();
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState("");

  const submit = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      await mutations.add(task.id, body);
      setDraft("");
    } finally {
      setSending(false);
    }
  };

  const startEdit = (id: number, body: string) => {
    setEditingId(id);
    setEditDraft(body);
  };

  const saveEdit = async (id: number) => {
    const body = editDraft.trim();
    if (!body) {
      setEditingId(null);
      return;
    }
    await mutations.update(task.id, id, body);
    setEditingId(null);
  };

  const confirmDelete = (id: number) => {
    const comment = task.comments.find((c) => c.id === id);
    if (!comment) return;
    const snapshotBody = comment.body;
    haptics.warning();
    void mutations.remove(task.id, id).then(() => {
      toast.show({
        title: i18n.t("toast.commentDeleted"),
        action: {
          label: i18n.t("toast.undo"),
          onPress: () => {
            void (async () => {
              try {
                await adminBoardApi.addComment(task.id, snapshotBody);
              } catch {
                toast.show({
                  title: i18n.t("toast.saveFailed"),
                  variant: "error",
                });
              }
            })();
          },
        },
      });
    });
  };

  const sorted = [...task.comments].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  return (
    <View style={{ gap: spacing.sm }}>
      <Text style={{ color: colors.foreground, fontSize: 16, fontWeight: "700" }}>
        {i18n.t("board.comments.title")}
      </Text>

      {sorted.length === 0 ? (
        <Text style={{ color: colors.mutedForeground, fontSize: 14 }}>
          {i18n.t("board.comments.empty")}
        </Text>
      ) : null}

      {sorted.map((c) => {
        const isOwn = c.authorId === currentUserId;
        const isEditing = editingId === c.id;
        return (
          <Pressable
            key={c.id}
            onLongPress={
              isOwn
                ? () => {
                    Alert.alert(i18n.t("board.comments.actions"), undefined, [
                      { text: i18n.t("common.cancel"), style: "cancel" },
                      { text: i18n.t("common.edit"), onPress: () => startEdit(c.id, c.body) },
                      {
                        text: i18n.t("common.delete"),
                        style: "destructive",
                        onPress: () => confirmDelete(c.id),
                      },
                    ]);
                  }
                : undefined
            }
            delayLongPress={500}
            accessibilityRole="text"
            accessibilityLabel={c.body}
            style={{
              padding: spacing.md,
              borderRadius: radius.md,
              backgroundColor: colors.surfaceBase,
              borderWidth: 1,
              borderColor: colors.border,
              gap: spacing.xs,
            }}
          >
            <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>
              {new Date(c.createdAt).toLocaleString()}
            </Text>
            {isEditing ? (
              <>
                <BottomSheetTextInput
                  value={editDraft}
                  onChangeText={setEditDraft}
                  multiline
                  style={{
                    color: colors.foreground,
                    fontSize: 14,
                    minHeight: 40,
                    padding: spacing.xs,
                    borderRadius: radius.md,
                    backgroundColor: colors.surfaceLow,
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                />
                <View style={{ flexDirection: "row", gap: spacing.sm }}>
                  <Pressable
                    onPress={() => setEditingId(null)}
                    style={{
                      paddingHorizontal: spacing.md,
                      paddingVertical: spacing.xs,
                      borderRadius: radius.md,
                      backgroundColor: colors.surfaceHigh,
                    }}
                  >
                    <Text style={{ color: colors.foreground }}>{i18n.t("common.cancel")}</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => saveEdit(c.id)}
                    style={{
                      paddingHorizontal: spacing.md,
                      paddingVertical: spacing.xs,
                      borderRadius: radius.md,
                      backgroundColor: colors.primary,
                    }}
                  >
                    <Text style={{ color: colors.primaryForeground }}>{i18n.t("common.save")}</Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <Text style={{ color: colors.foreground, fontSize: 14 }}>{c.body}</Text>
            )}
          </Pressable>
        );
      })}

      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <BottomSheetTextInput
          value={draft}
          onChangeText={setDraft}
          placeholder={i18n.t("board.comments.addPlaceholder")}
          placeholderTextColor={colors.mutedForeground}
          multiline
          style={{
            flex: 1,
            padding: spacing.sm,
            minHeight: 40,
            borderRadius: radius.md,
            backgroundColor: colors.surfaceLow,
            borderWidth: 1,
            borderColor: colors.border,
            color: colors.foreground,
            fontSize: 14,
          }}
        />
        <Pressable
          onPress={submit}
          disabled={!draft.trim() || sending}
          accessibilityRole="button"
          accessibilityLabel={i18n.t("board.comments.send")}
          style={{
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.sm,
            borderRadius: radius.md,
            backgroundColor:
              draft.trim() && !sending ? colors.primary : colors.surfaceHigh,
            alignSelf: "flex-end",
          }}
        >
          <Text
            style={{
              color:
                draft.trim() && !sending ? colors.primaryForeground : colors.mutedForeground,
              fontWeight: "700",
            }}
          >
            {i18n.t("board.comments.send")}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
