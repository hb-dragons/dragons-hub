import { FlatList, Pressable, Text, View, ActivityIndicator, RefreshControl } from "react-native";
import { router } from "expo-router";
import { useBoardList } from "@/hooks/board/useBoardList";
import { useTheme } from "@/hooks/useTheme";
import { i18n } from "@/lib/i18n";

export default function BoardListScreen() {
  const { colors, spacing, radius } = useTheme();
  const { data, isLoading, mutate, isValidating } = useBoardList();

  if (isLoading && !data) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.foreground} />
      </View>
    );
  }

  return (
    <FlatList
      data={data ?? []}
      keyExtractor={(b) => String(b.id)}
      contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
      refreshControl={
        <RefreshControl
          refreshing={isValidating && !isLoading}
          onRefresh={() => { void mutate(); }}
          tintColor={colors.foreground}
        />
      }
      ListEmptyComponent={
        <Text
          style={{
            color: colors.mutedForeground,
            textAlign: "center",
            marginTop: spacing.xl,
          }}
        >
          {i18n.t("admin.boards.empty")}
        </Text>
      }
      renderItem={({ item }) => (
        <Pressable
          onPress={() => router.push(`/admin/boards/${item.id}`)}
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
  );
}
