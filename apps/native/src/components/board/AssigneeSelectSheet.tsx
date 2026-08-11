import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import useSWR from "swr";
import { SheetScreen } from "@/components/sheets/SheetScreen";
import { singleLineInput } from "@/components/ui/inputStyles";
import { useDebouncedValue } from "@/hooks/useDebounce";
import { authClient } from "@/lib/auth-client";
import { useTheme } from "@/hooks/useTheme";
import { i18n } from "@/lib/i18n";

interface PickableUser {
  id: string;
  name: string | null;
  email: string;
}

interface Props {
  /** Drawn in content — these sheets have no native header. */
  title: string;
  initialSelected: Set<string>;
  /** Called once, with the final selection, when the user taps Apply. */
  onApply: (selected: Set<string>) => void;
  testID?: string;
}

/**
 * Multi-select over the user directory, shared by the two assignee sheets
 * (`assignees` assigns a task, `assignee-filter` scopes the board). They pick
 * from the same list with the same interaction and differ only in what the
 * caller does with the result, so they share one body.
 */
export function AssigneeSelectSheet({ title, initialSelected, onApply, testID }: Props) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initialSelected));
  const theme = useTheme();
  const { colors, spacing, radius } = theme;
  const insets = useSafeAreaInsets();

  // One request per pause, not per keystroke. The SWR key must use the
  // debounced value too: every keystroke produces a distinct key, so
  // `dedupingInterval` cannot collapse them.
  const debouncedSearch = useDebouncedValue(search);

  const { data: userPage, isLoading } = useSWR(["admin/users", debouncedSearch], async () => {
    const result = await authClient.admin.listUsers({
      query: {
        limit: 50,
        offset: 0,
        searchValue: debouncedSearch || undefined,
        searchField: "name",
        searchOperator: "contains",
      },
    });
    if (result.error) throw new Error(result.error.message ?? "failed");
    return result.data;
  });

  const users: PickableUser[] = useMemo(() => {
    if (!userPage?.users) return [];
    return userPage.users.map((user) => ({
      id: user.id,
      name: user.name ?? null,
      email: user.email,
    }));
  }, [userPage]);

  const selectedFirst = useMemo(() => {
    return [...users].sort((a, b) => {
      const aHas = selected.has(a.id) ? 0 : 1;
      const bHas = selected.has(b.id) ? 0 : 1;
      if (aHas !== bHas) return aHas - bHas;
      return (a.name ?? a.email).localeCompare(b.name ?? b.email);
    });
    // Ordering is snapshotted against the list, NOT against `selected`:
    // re-sorting on every toggle made the just-tapped row jump away from the
    // user's finger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [users]);

  const toggle = useCallback((id: string) => {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

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

  const footer = (
    <View
      style={{
        paddingHorizontal: spacing.lg,
        paddingTop: spacing.md,
        paddingBottom: spacing.md + insets.bottom,
        backgroundColor: colors.background,
        borderTopWidth: 1,
        borderTopColor: colors.border,
      }}
    >
      <Pressable
        onPress={() => onApply(selected)}
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
  );

  return (
    <SheetScreen layout="fill" footer={footer} testID={testID}>
      <View
        style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
      >
        <Text style={{ color: colors.foreground, fontSize: 18, fontWeight: "700" }}>{title}</Text>
        {selected.size > 0 ? (
          <Pressable
            onPress={() => setSelected(new Set())}
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

      <TextInput
        value={search}
        onChangeText={setSearch}
        placeholder={i18n.t("board.assignees.searchPlaceholder")}
        placeholderTextColor={colors.mutedForeground}
        autoCapitalize="none"
        autoCorrect={false}
        style={singleLineInput(theme)}
      />

      {isLoading && selectedFirst.length === 0 ? (
        <ActivityIndicator color={colors.foreground} style={{ marginTop: spacing.xl }} />
      ) : (
        <FlatList
          data={selectedFirst}
          keyExtractor={(user) => user.id}
          renderItem={renderItem}
          keyboardShouldPersistTaps="handled"
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
    </SheetScreen>
  );
}
