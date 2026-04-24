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
  BottomSheetModal,
  BottomSheetTextInput,
} from "@gorhom/bottom-sheet";
import useSWR from "swr";
import type { TaskAssignee } from "@dragons/shared";
import { authClient } from "@/lib/auth-client";
import { useTheme } from "@/hooks/useTheme";
import { i18n } from "@/lib/i18n";

interface PickableUser {
  id: string;
  name: string | null;
  email: string;
}

export interface AssigneePickerHandle {
  open: (
    taskId: number,
    currentAssignees: TaskAssignee[],
    onToggle: (userId: string, add: boolean) => void | Promise<void>,
  ) => void;
}

export const AssigneePickerSheet = forwardRef<AssigneePickerHandle>(
  function AssigneePickerSheet(_props, ref) {
    const sheetRef = useRef<BottomSheetModal>(null);
    const currentRef = useRef<Set<string>>(new Set());
    const onToggleRef = useRef<(id: string, add: boolean) => void | Promise<void>>(
      () => {},
    );
    const [search, setSearch] = useState("");
    const [assigneeVersion, setAssigneeVersion] = useState(0);
    const snapPoints = useMemo(() => ["92%"], []);
    const { colors, spacing, radius } = useTheme();

    useImperativeHandle(
      ref,
      () => ({
        open: (_taskId, currentAssignees, onToggle) => {
          currentRef.current = new Set(currentAssignees.map((a) => a.userId));
          onToggleRef.current = onToggle;
          setSearch("");
          setAssigneeVersion((v) => v + 1);
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
        const aHas = currentRef.current.has(a.id) ? 0 : 1;
        const bHas = currentRef.current.has(b.id) ? 0 : 1;
        return aHas - bHas;
      });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [users, assigneeVersion]);

    const renderItem = useCallback(
      ({ item }: { item: PickableUser }) => {
        const isAssigned = currentRef.current.has(item.id);
        return (
          <Pressable
            onPress={async () => {
              const next = !isAssigned;
              if (next) currentRef.current.add(item.id);
              else currentRef.current.delete(item.id);
              setAssigneeVersion((v) => v + 1);
              try {
                await onToggleRef.current(item.id, next);
              } catch {
                // rollback on failure
                if (next) currentRef.current.delete(item.id);
                else currentRef.current.add(item.id);
                setAssigneeVersion((v) => v + 1);
              }
            }}
            accessibilityRole="button"
            accessibilityLabel={item.name ?? item.email}
            accessibilityState={{ selected: isAssigned }}
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
            {isAssigned ? (
              <View
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 9,
                  backgroundColor: colors.primary,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text
                  style={{
                    color: colors.primaryForeground,
                    fontSize: 12,
                    fontWeight: "700",
                  }}
                >
                  ✓
                </Text>
              </View>
            ) : null}
          </Pressable>
        );
      },
      // assigneeVersion drives re-render when assignment state changes
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [colors, spacing, radius, assigneeVersion],
    );

    return (
      <BottomSheetModal
        ref={sheetRef}
        snapPoints={snapPoints}
        backgroundStyle={{ backgroundColor: colors.background }}
        handleIndicatorStyle={{ backgroundColor: colors.mutedForeground }}
        enablePanDownToClose
        keyboardBehavior="interactive"
        keyboardBlurBehavior="restore"
      >
        <View style={{ padding: spacing.md, gap: spacing.sm }}>
          <BottomSheetTextInput
            value={search}
            onChangeText={setSearch}
            placeholder={i18n.t("board.assignees.searchPlaceholder")}
            placeholderTextColor={colors.mutedForeground}
            autoCapitalize="none"
            autoCorrect={false}
            style={{
              padding: spacing.md,
              borderRadius: radius.md,
              backgroundColor: colors.surfaceLow,
              borderWidth: 1,
              borderColor: colors.border,
              color: colors.foreground,
              fontSize: 15,
            }}
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
              paddingBottom: spacing["2xl"],
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
