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
import { authClient } from "@/lib/auth-client";
import { useTheme } from "@/hooks/useTheme";
import { i18n } from "@/lib/i18n";

interface PickableUser {
  id: string;
  name: string | null;
  email: string;
}

export interface AssigneeFilterSheetHandle {
  open: (
    initialSelected: Set<string>,
    onApply: (next: Set<string>) => void,
  ) => void;
}

export const AssigneeFilterSheet = forwardRef<AssigneeFilterSheetHandle>(
  function AssigneeFilterSheet(_p, ref) {
    const sheetRef = useRef<BottomSheetModal>(null);
    const onApplyRef = useRef<(next: Set<string>) => void>(() => {});
    const [search, setSearch] = useState("");
    const [selected, setSelected] = useState<Set<string>>(() => new Set());
    const snapPoints = useMemo(() => ["92%"], []);
    const { colors, spacing, radius } = useTheme();

    useImperativeHandle(
      ref,
      () => ({
        open: (initialSelected, onApply) => {
          setSelected(new Set(initialSelected));
          onApplyRef.current = onApply;
          setSearch("");
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

    const sortedUsers = useMemo(() => {
      return [...users].sort((a, b) => {
        const aHas = selected.has(a.id) ? 0 : 1;
        const bHas = selected.has(b.id) ? 0 : 1;
        return aHas - bHas;
      });
    }, [users, selected]);

    const toggle = useCallback((id: string) => {
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    }, []);

    const apply = () => {
      onApplyRef.current(selected);
      sheetRef.current?.dismiss();
    };

    const clearAll = () => {
      setSelected(new Set());
    };

    const renderItem = useCallback(
      ({ item }: { item: PickableUser }) => {
        const isSelected = selected.has(item.id);
        return (
          <Pressable
            onPress={() => toggle(item.id)}
            accessibilityRole="checkbox"
            accessibilityLabel={item.name ?? item.email}
            accessibilityState={{ checked: isSelected }}
            style={({ pressed }) => ({
              padding: spacing.md,
              marginBottom: spacing.xs,
              borderRadius: radius.md,
              backgroundColor: pressed ? colors.surfaceHigh : colors.surfaceBase,
              borderWidth: 1,
              borderColor: isSelected ? colors.primary : colors.border,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            })}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.foreground, fontSize: 15, fontWeight: "600" }}>
                {item.name ?? i18n.t("board.task.unnamedUser")}
              </Text>
              <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>{item.email}</Text>
            </View>
            <View
              style={{
                width: 22,
                height: 22,
                borderRadius: 4,
                borderWidth: 2,
                borderColor: isSelected ? colors.primary : colors.border,
                backgroundColor: isSelected ? colors.primary : "transparent",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {isSelected ? (
                <Text style={{ color: colors.primaryForeground, fontSize: 14, fontWeight: "700" }}>
                  ✓
                </Text>
              ) : null}
            </View>
          </Pressable>
        );
      },
      [colors, spacing, radius, selected, toggle],
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
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={{ color: colors.foreground, fontSize: 18, fontWeight: "700" }}>
              {i18n.t("board.filters.assignees")}
            </Text>
            {selected.size > 0 ? (
              <Pressable
                onPress={clearAll}
                accessibilityRole="button"
                accessibilityLabel={i18n.t("common.clear")}
                hitSlop={12}
              >
                <Text style={{ color: colors.primary, fontSize: 14, fontWeight: "600" }}>
                  {i18n.t("common.clear")} ({selected.size})
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

        {isLoading && sortedUsers.length === 0 ? (
          <View style={{ flex: 1, alignItems: "center", paddingTop: spacing.xl }}>
            <ActivityIndicator color={colors.foreground} />
          </View>
        ) : (
          <BottomSheetFlatList
            data={sortedUsers}
            keyExtractor={(u) => u.id}
            contentContainerStyle={{ padding: spacing.md, paddingBottom: 120 }}
            renderItem={renderItem}
            ListEmptyComponent={
              <Text style={{ color: colors.mutedForeground, textAlign: "center", marginTop: spacing.lg }}>
                {i18n.t("board.assignees.empty")}
              </Text>
            }
          />
        )}

        <View
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            padding: spacing.md,
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
      </BottomSheetModal>
    );
  },
);
