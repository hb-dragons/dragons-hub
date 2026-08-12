import {
  FlatList,
  Pressable,
  Text,
  View,
  RefreshControl,
} from "react-native";
import { Stack, router } from "expo-router";
import { useBoardList } from "@/hooks/board/useBoardList";
import { useTheme } from "@/hooks/useTheme";
import { i18n } from "@/lib/i18n";
import { openCreateBoardSheet } from "@/lib/nav/board-sheets";
import { BoardListSkeleton } from "@/components/board/BoardListSkeleton";
import { HeaderActions, type HeaderAction } from "@/components/nav/HeaderActions";

/** The list's one bar action. A constant so it is not a fresh array per render. */
const CREATE_BOARD_ACTION: readonly HeaderAction<"create">[] = [
  { key: "create", labelKey: "admin.boards.new", icon: "add" },
];

export default function BoardListScreen() {
  const { colors, spacing, radius } = useTheme();
  const { data, isLoading, mutate, isValidating } = useBoardList();

  // One declaration site, rendered by both the skeleton and the loaded list:
  // attaching the title and the "+" button only after the boards arrive
  // reconfigures the native header mid push-transition, which flashes.
  return (
    <>
      <Stack.Screen options={{ title: i18n.t("admin.boards.title") }} />
      {/* A bar button item rather than a `headerRight` render prop (#224): the
          "+" was a `Pressable` padded to a tap target by hand, which is what
          UIKit does for a bar button item anyway — and better, since it also
          gets the bar's tint and its iOS 26 glass. */}
      <HeaderActions items={CREATE_BOARD_ACTION} onAction={openCreateBoardSheet} />
      {isLoading && !data ? (
        <BoardListSkeleton />
      ) : (
        <FlatList
          data={data ?? []}
          keyExtractor={(b) => String(b.id)}
          contentInsetAdjustmentBehavior="automatic"
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
                onPress={openCreateBoardSheet}
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
      )}
    </>
  );
}
