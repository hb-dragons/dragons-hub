import { useState } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import useSWR from "swr";
import { APIError } from "@dragons/api-client";
import type {
  CandidateSearchResponse,
  RefereeGameListItem,
} from "@dragons/shared";

type RefCandidate = CandidateSearchResponse["results"][number];
import { useTheme } from "../hooks/useTheme";
import { refereeApi } from "../lib/api";
import { i18n } from "../lib/i18n";
import { fontFamilies } from "../theme/typography";

interface AssignRefereeModalProps {
  visible: boolean;
  game: RefereeGameListItem | null;
  slotNumber: 1 | 2;
  onClose: () => void;
  onSuccess: () => void | Promise<void>;
}

export function AssignRefereeModal({
  visible,
  game,
  slotNumber,
  onClose,
  onSuccess,
}: AssignRefereeModalProps) {
  const { colors, spacing, radius, textStyles } = useTheme();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<RefCandidate | null>(null);
  const [loading, setLoading] = useState(false);

  const swrKey =
    visible && game
      ? `candidates:${String(game.apiMatchId)}:${String(slotNumber)}:${search}`
      : null;

  const { data, isLoading } = useSWR<CandidateSearchResponse>(
    swrKey,
    () =>
      refereeApi.searchAssignmentCandidates(game!.apiMatchId, {
        slotNumber,
        search,
        pageFrom: 0,
        pageSize: 15,
      }),
  );

  function handleClose() {
    setSearch("");
    setSelected(null);
    onClose();
  }

  async function handleConfirm() {
    if (!game || !selected) return;
    setLoading(true);
    try {
      await refereeApi.assignReferee(game.apiMatchId, {
        slotNumber,
        refereeApiId: selected.srId,
      });
      await onSuccess();
      handleClose();
      Alert.alert(
        i18n.t("refereeGame.admin.assignSuccess"),
        `${selected.vorname} ${selected.nachName}`,
      );
    } catch (error) {
      const message =
        error instanceof APIError
          ? error.message
          : i18n.t("refereeGame.admin.assignFailed");
      Alert.alert(i18n.t("refereeGame.admin.assignFailed"), message);
    } finally {
      setLoading(false);
    }
  }

  const slotLabel = slotNumber === 1 ? "SR1" : "SR2";
  const title = i18n.t("refereeGame.admin.assignTitle", { slot: slotLabel });

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: colors.background }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: spacing.lg,
            paddingTop: spacing.lg,
            paddingBottom: spacing.md,
          }}
        >
          <Text
            style={{
              fontSize: 18,
              fontFamily: fontFamilies.bodySemiBold,
              color: colors.foreground,
            }}
          >
            {title}
          </Text>
          <Pressable onPress={handleClose} disabled={loading} hitSlop={8}>
            <Text
              style={{
                fontSize: 15,
                fontFamily: fontFamilies.body,
                color: colors.mutedForeground,
              }}
            >
              {i18n.t("refereeGame.admin.cancel")}
            </Text>
          </Pressable>
        </View>

        {game ? (
          <Text
            style={{
              paddingHorizontal: spacing.lg,
              paddingBottom: spacing.md,
              fontSize: 13,
              color: colors.mutedForeground,
              fontFamily: fontFamilies.body,
            }}
            numberOfLines={1}
          >
            {game.homeTeamName} {i18n.t("common.vs")} {game.guestTeamName} —{" "}
            {game.kickoffDate}
          </Text>
        ) : null}

        <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.sm }}>
          <TextInput
            value={search}
            onChangeText={(v) => {
              setSearch(v);
              setSelected(null);
            }}
            placeholder={i18n.t("refereeGame.admin.searchPlaceholder")}
            placeholderTextColor={colors.mutedForeground}
            autoCapitalize="none"
            autoCorrect={false}
            style={{
              fontFamily: fontFamilies.body,
              fontSize: 16,
              backgroundColor: colors.input,
              borderWidth: 1,
              borderColor: colors.border + "33",
              borderRadius: radius.md,
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.md,
              color: colors.foreground,
            }}
          />
        </View>

        <View style={{ flex: 1 }}>
          {isLoading && !data ? (
            <View
              style={{
                flex: 1,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : data && data.results.length === 0 ? (
            <View
              style={{
                flex: 1,
                alignItems: "center",
                justifyContent: "center",
                paddingHorizontal: spacing.xl,
              }}
            >
              <Text
                style={[
                  textStyles.body,
                  { color: colors.mutedForeground, textAlign: "center" },
                ]}
              >
                {i18n.t("refereeGame.admin.noResults")}
              </Text>
            </View>
          ) : (
            <FlatList
              data={data?.results ?? []}
              keyExtractor={(item) => String(item.srId)}
              contentContainerStyle={{
                paddingHorizontal: spacing.lg,
                paddingBottom: spacing.lg,
              }}
              renderItem={({ item }) => {
                const active = selected?.srId === item.srId;
                return (
                  <Pressable
                    onPress={() => setSelected(item)}
                    style={({ pressed }) => ({
                      paddingVertical: spacing.md,
                      paddingHorizontal: spacing.md,
                      borderRadius: radius.md,
                      backgroundColor: active
                        ? colors.primary + "1A"
                        : pressed
                          ? colors.surfaceHigh
                          : "transparent",
                      marginBottom: spacing.xs,
                    })}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: spacing.sm,
                      }}
                    >
                      <Text
                        style={{
                          flex: 1,
                          fontSize: 15,
                          fontFamily: active
                            ? fontFamilies.bodySemiBold
                            : fontFamilies.body,
                          color: active ? colors.primary : colors.foreground,
                        }}
                        numberOfLines={1}
                      >
                        {item.vorname} {item.nachName}
                      </Text>
                      {item.distanceKm ? (
                        <Text
                          style={{
                            fontSize: 12,
                            fontFamily: fontFamilies.body,
                            color: colors.mutedForeground,
                          }}
                        >
                          {item.distanceKm} km
                        </Text>
                      ) : null}
                    </View>
                    {item.warning.length > 0 ? (
                      <Text
                        style={{
                          marginTop: 2,
                          fontSize: 11,
                          color: colors.destructive,
                          fontFamily: fontFamilies.body,
                        }}
                        numberOfLines={1}
                      >
                        ⚠ {item.warning[0]}
                      </Text>
                    ) : null}
                  </Pressable>
                );
              }}
            />
          )}
        </View>

        <View
          style={{
            paddingHorizontal: spacing.lg,
            paddingVertical: spacing.md,
            borderTopWidth: 1,
            borderTopColor: colors.border,
            flexDirection: "row",
            gap: spacing.sm,
          }}
        >
          <Pressable
            onPress={handleClose}
            disabled={loading}
            style={({ pressed }) => ({
              flex: 1,
              borderRadius: radius.md,
              borderWidth: 1,
              borderColor: colors.border,
              paddingVertical: spacing.md,
              alignItems: "center",
              opacity: pressed ? 0.75 : 1,
            })}
          >
            <Text style={[textStyles.button, { color: colors.foreground }]}>
              {i18n.t("refereeGame.admin.cancel")}
            </Text>
          </Pressable>
          <Pressable
            onPress={handleConfirm}
            disabled={!selected || loading}
            style={({ pressed }) => ({
              flex: 1,
              borderRadius: radius.md,
              backgroundColor: colors.primary,
              paddingVertical: spacing.md,
              alignItems: "center",
              opacity: !selected || loading ? 0.5 : pressed ? 0.85 : 1,
            })}
          >
            {loading ? (
              <ActivityIndicator color={colors.primaryForeground} />
            ) : (
              <Text
                style={[textStyles.button, { color: colors.primaryForeground }]}
              >
                {i18n.t("refereeGame.admin.assign")}
              </Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
