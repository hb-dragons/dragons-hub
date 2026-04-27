import { useRef } from "react";
import {
  FlatList,
  Pressable,
  Text,
  View,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { Stack, router } from "expo-router";
import { useBoardList } from "@/hooks/board/useBoardList";
import { useTheme } from "@/hooks/useTheme";
import { i18n } from "@/lib/i18n";
import {
  CreateBoardSheet,
  type CreateBoardSheetHandle,
} from "@/components/board/CreateBoardSheet";

export default function BoardListScreen() {
  const { colors, spacing, radius } = useTheme();
  const { data, isLoading, mutate, isValidating } = useBoardList();
  const createRef = useRef<CreateBoardSheetHandle | null>(null);

  const openCreate = () =>
    createRef.current?.open((id) => {
      router.push(`/admin/boards/${id}`);
    });

  const renderHeaderRight = () => (
    <Pressable
      onPress={openCreate}
      accessibilityRole="button"
      accessibilityLabel={i18n.t("admin.boards.new")}
      hitSlop={12}
      style={{ paddingHorizontal: spacing.md, paddingVertical: spacing.sm }}
    >
      <Text
        style={{
          color: colors.primary,
          fontSize: 22,
          fontWeight: "700",
          lineHeight: 22,
        }}
      >
        +
      </Text>
    </Pressable>
  );

  if (isLoading && !data) {
    return (
      <>
        <Stack.Screen
          options={{
            title: i18n.t("admin.boards.title"),
            headerRight: renderHeaderRight,
          }}
        />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={colors.foreground} />
        </View>
        <CreateBoardSheet ref={createRef} />
      </>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: i18n.t("admin.boards.title"),
          headerRight: renderHeaderRight,
        }}
      />
      <FlatList
        data={data ?? []}
        keyExtractor={(b) => String(b.id)}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, flexGrow: 1 }}
        refreshControl={
          <RefreshControl
            refreshing={isValidating && !isLoading}
            onRefresh={() => {
              void mutate();
            }}
            tintColor={colors.foreground}
          />
        }
        ListEmptyComponent={
          <View
            style={{
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
              paddingVertical: spacing["3xl"],
              gap: spacing.md,
            }}
          >
            <Text
              style={{
                color: colors.foreground,
                textAlign: "center",
                fontSize: 16,
                fontWeight: "600",
              }}
            >
              {i18n.t("admin.boards.empty")}
            </Text>
            <Text
              style={{
                color: colors.mutedForeground,
                textAlign: "center",
                fontSize: 14,
              }}
            >
              {i18n.t("admin.boards.emptyHint")}
            </Text>
            <Pressable
              onPress={openCreate}
              accessibilityRole="button"
              style={{
                marginTop: spacing.sm,
                paddingHorizontal: spacing.lg,
                paddingVertical: spacing.md,
                borderRadius: radius.md,
                backgroundColor: colors.primary,
              }}
            >
              <Text
                style={{
                  color: colors.primaryForeground,
                  fontWeight: "700",
                  fontSize: 14,
                }}
              >
                {i18n.t("admin.boards.new")}
              </Text>
            </Pressable>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push(`/admin/boards/${item.id}`)}
            accessibilityRole="button"
            accessibilityLabel={item.name}
            style={{
              padding: spacing.lg,
              borderRadius: radius.md,
              backgroundColor: colors.surfaceHigh,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Text style={{ color: colors.foreground, fontSize: 17, fontWeight: "600" }}>
              {item.name}
            </Text>
            {item.description ? (
              <Text
                numberOfLines={2}
                style={{ color: colors.mutedForeground, marginTop: spacing.xs }}
              >
                {item.description}
              </Text>
            ) : null}
          </Pressable>
        )}
      />
      <CreateBoardSheet ref={createRef} />
    </>
  );
}
