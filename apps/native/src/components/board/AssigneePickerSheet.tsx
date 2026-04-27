import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import {
  BottomSheetFlatList,
  BottomSheetFooter,
  BottomSheetModal,
  BottomSheetTextInput,
  type BottomSheetFooterProps,
} from "@gorhom/bottom-sheet";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import useSWR from "swr";
import type { TaskAssignee } from "@dragons/shared";
import { authClient } from "@/lib/auth-client";
import { useTheme } from "@/hooks/useTheme";
import { i18n } from "@/lib/i18n";
import { singleLineInput } from "@/components/ui/inputStyles";

interface PickableUser {
  id: string;
  name: string | null;
  email: string;
}

export interface AssigneePickerHandle {
  /**
   * Opens the picker. Selections are accumulated locally; nothing is saved
   * until the user taps Apply, at which point `onApply` receives the final
   * Set of user IDs. Dismissing without Apply discards the changes.
   */
  open: (
    taskId: number,
    currentAssignees: TaskAssignee[],
    onApply: (selected: Set<string>) => void | Promise<void>,
  ) => void;
}

export const AssigneePickerSheet = forwardRef<AssigneePickerHandle>(
  function AssigneePickerSheet(_props, ref) {
    const sheetRef = useRef<BottomSheetModal>(null);
    const onApplyRef = useRef<(next: Set<string>) => void | Promise<void>>(
      () => {},
    );
    const initialRef = useRef<Set<string>>(new Set());
    const [search, setSearch] = useState("");
    const [assignedIds, setAssignedIds] = useState<Set<string>>(() => new Set());
    // Snapshotted ordering: the "selected first" sort is recomputed only on
    // open / when the user list changes — not on every toggle. Without this,
    // rows jump under the user's finger when checked.
    const [orderToken, setOrderToken] = useState(0);
    const snapPoints = useMemo(() => ["92%"], []);
    const theme = useTheme();
    const { colors, spacing, radius } = theme;
    const insets = useSafeAreaInsets();

    useImperativeHandle(
      ref,
      () => ({
        open: (_taskId, currentAssignees, onApply) => {
          const initial = new Set(currentAssignees.map((a) => a.userId));
          initialRef.current = initial;
          setAssignedIds(new Set(initial));
          onApplyRef.current = onApply;
          setSearch("");
          setOrderToken((n) => n + 1);
          sheetRef.current?.present();
        },
      }),
      [],
    );

    const { data: userPage, isLoading } = useSWR(
      ["admin/users", search],
      async () => {
        const result = await authClient.admin.listUsers({
          query: {
            limit: 50,
            offset: 0,
            searchValue: search || undefined,
            searchField: "name",
            searchOperator: "contains",
          },
        });
        if (result.error) throw new Error(result.error.message ?? "failed");
        return result.data;
      },
    );

    const users: PickableUser[] = useMemo(() => {
      if (!userPage?.users) return [];
      return userPage.users.map((u) => ({
        id: u.id,
        name: u.name ?? null,
        email: u.email,
      }));
    }, [userPage]);

    const assignedFirst = useMemo(() => {
      return [...users].sort((a, b) => {
        const aHas = assignedIds.has(a.id) ? 0 : 1;
        const bHas = assignedIds.has(b.id) ? 0 : 1;
        if (aHas !== bHas) return aHas - bHas;
        return (a.name ?? a.email).localeCompare(b.name ?? b.email);
      });
      // Order is snapshotted via orderToken so toggling does not re-sort the
      // visible list and rows don't jump under the user's finger.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [users, orderToken]);

    const toggle = useCallback((id: string) => {
      setAssignedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    }, []);

    const apply = () => {
      // Pass the resulting Set; caller computes the diff against the original
      // and runs the appropriate add/remove mutations.
      void onApplyRef.current(assignedIds);
      sheetRef.current?.dismiss();
    };

    const clearAll = () => setAssignedIds(new Set());

    const renderFooter = useCallback(
      (props: BottomSheetFooterProps) => (
        <BottomSheetFooter {...props} bottomInset={insets.bottom}>
          <View
            style={{
              paddingHorizontal: spacing.md,
              paddingTop: spacing.md,
              paddingBottom: spacing.md,
              backgroundColor: colors.background,
              borderTopWidth: 1,
              borderTopColor: colors.border,
            }}
          >
            <Pressable
              onPress={apply}
              accessibilityRole="button"
              accessibilityLabel={i18n.t("common.apply")}
              style={{
                padding: spacing.md,
                borderRadius: radius.md,
                backgroundColor: colors.primary,
                alignItems: "center",
              }}
            >
              <Text style={{ color: colors.primaryForeground, fontWeight: "700" }}>
                {i18n.t("common.apply")}
              </Text>
            </Pressable>
          </View>
        </BottomSheetFooter>
      ),
      // `apply` reads the latest assignedIds via closure; recreate the footer
      // when assignedIds changes so onPress always sees the current selection.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [assignedIds, colors, spacing, radius, insets.bottom],
    );

    const renderItem = useCallback(
      ({ item }: { item: PickableUser }) => {
        const isAssigned = assignedIds.has(item.id);
        return (
          <Pressable
            onPress={() => toggle(item.id)}
            accessibilityRole="checkbox"
            accessibilityLabel={item.name ?? item.email}
            accessibilityState={{ checked: isAssigned }}
            style={({ pressed }) => ({
              padding: spacing.md,
              marginBottom: spacing.xs,
              borderRadius: radius.md,
              backgroundColor: pressed ? colors.surfaceHigh : colors.surfaceBase,
              borderWidth: 1,
              borderColor: isAssigned ? colors.primary : colors.border,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            })}
          >
            <View style={{ flex: 1 }}>
              <Text
                style={{ color: colors.foreground, fontSize: 15, fontWeight: "600" }}
              >
                {item.name ?? i18n.t("board.task.unnamedUser")}
              </Text>
              <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>
                {item.email}
              </Text>
            </View>
            <View
              style={{
                width: 22,
                height: 22,
                borderRadius: 4,
                borderWidth: 2,
                borderColor: isAssigned ? colors.primary : colors.border,
                backgroundColor: isAssigned ? colors.primary : "transparent",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {isAssigned ? (
                <Text
                  style={{
                    color: colors.primaryForeground,
                    fontSize: 14,
                    fontWeight: "700",
                  }}
                >
                  ✓
                </Text>
              ) : null}
            </View>
          </Pressable>
        );
      },
      [colors, spacing, radius, assignedIds, toggle],
    );

    return (
      <BottomSheetModal
        ref={sheetRef}
        snapPoints={snapPoints}
        enableDynamicSizing={false}
        backgroundStyle={{ backgroundColor: colors.background }}
        handleIndicatorStyle={{ backgroundColor: colors.mutedForeground }}
        enablePanDownToClose
        keyboardBehavior="extend"
        keyboardBlurBehavior="restore"
        android_keyboardInputMode="adjustResize"
        footerComponent={renderFooter}
      >
        <View style={{ padding: spacing.md, gap: spacing.sm }} testID="assignee-picker-sheet">
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Text
              style={{
                color: colors.foreground,
                fontSize: 18,
                fontWeight: "700",
              }}
            >
              {i18n.t("board.assignees.title")}
            </Text>
            {assignedIds.size > 0 ? (
              <Pressable
                onPress={clearAll}
                accessibilityRole="button"
                accessibilityLabel={i18n.t("common.clear")}
                hitSlop={12}
              >
                <Text style={{ color: colors.primary, fontSize: 14, fontWeight: "600" }}>
                  {i18n.t("common.clear")} ({assignedIds.size})
                </Text>
              </Pressable>
            ) : null}
          </View>
          <BottomSheetTextInput
            value={search}
            onChangeText={setSearch}
            placeholder={i18n.t("board.assignees.searchPlaceholder")}
            placeholderTextColor={colors.mutedForeground}
            autoCapitalize="none"
            autoCorrect={false}
            style={singleLineInput(theme)}
          />
        </View>

        {isLoading && assignedFirst.length === 0 ? (
          <View
            style={{ flex: 1, alignItems: "center", paddingTop: spacing.xl }}
          >
            <ActivityIndicator color={colors.foreground} />
          </View>
        ) : (
          <BottomSheetFlatList
            data={assignedFirst}
            keyExtractor={(u) => u.id}
            contentContainerStyle={{
              padding: spacing.md,
              // Reserve room for the sticky Apply bar (button + padding +
              // safe-area). Without this the last row sits under the bar.
              paddingBottom: 96 + insets.bottom,
            }}
            renderItem={renderItem}
            ListEmptyComponent={
              <Text
                style={{
                  color: colors.mutedForeground,
                  textAlign: "center",
                  marginTop: spacing.lg,
                }}
              >
                {i18n.t("board.assignees.empty")}
              </Text>
            }
          />
        )}

      </BottomSheetModal>
    );
  },
);
