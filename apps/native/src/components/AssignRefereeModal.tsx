import { useMemo, useState } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  Pressable,
  SectionList,
  ActivityIndicator,
  Alert,
  Keyboard,
  Platform,
} from "react-native";
import Svg, { Path, Circle } from "react-native-svg";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import { useReanimatedKeyboardAnimation } from "react-native-keyboard-controller";
import useSWR from "swr";
import { APIError } from "@dragons/api-client";
import type {
  CandidateSearchResponse,
  RefereeGameListItem,
} from "@dragons/shared";

import { useTheme } from "../hooks/useTheme";
import { refereeApi } from "../lib/api";
import { i18n } from "../lib/i18n";
import { fontFamilies } from "../theme/typography";

type RefCandidate = CandidateSearchResponse["results"][number];
type ThemeColors = ReturnType<typeof useTheme>["colors"];

interface AssignRefereeModalProps {
  visible: boolean;
  game: RefereeGameListItem | null;
  slotNumber: 1 | 2;
  onClose: () => void;
  onSuccess: () => void | Promise<void>;
}

type BracketKey = "close" | "med" | "far";

function bracketFor(km: number): BracketKey {
  if (km < 20) return "close";
  if (km < 30) return "med";
  return "far";
}

function bracketColor(b: BracketKey, colors: ThemeColors): string {
  if (b === "close") return colors.primary;
  if (b === "med") return colors.heat;
  return colors.destructive;
}

function bracketLabel(b: BracketKey): string {
  if (b === "close") return i18n.t("refereeGame.admin.nearby");
  if (b === "med") return i18n.t("refereeGame.admin.further");
  return i18n.t("refereeGame.admin.distant");
}

function initials(c: RefCandidate): string {
  const f = c.vorname?.charAt(0) ?? "";
  const l = c.nachName?.charAt(0) ?? "";
  return `${f}${l}`.toUpperCase();
}

function avatarPalette(
  key: string,
  colors: ThemeColors,
): { bg: string; fg: string } {
  const options: Array<{ bg: string; fg: string }> = [
    { bg: colors.secondary, fg: colors.secondaryForeground },
    { bg: colors.heatSubtle, fg: colors.heat },
    { bg: colors.surfaceHigh, fg: colors.foreground },
    { bg: colors.muted, fg: colors.mutedForeground },
  ];
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) hash = (hash + key.charCodeAt(i)) | 0;
  const pick = options[Math.abs(hash) % options.length];
  // Non-null because options is non-empty and index is in range.
  return pick ?? options[0]!;
}

function SearchIcon({ color, size = 18 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 18 18" fill="none">
      <Circle cx={8} cy={8} r={5.5} stroke={color} strokeWidth={1.8} />
      <Path
        d="m16 16-3.8-3.8"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
      />
    </Svg>
  );
}

function CloseIcon({ color, size = 12 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 12 12" fill="none">
      <Path
        d="m3 3 6 6M9 3l-6 6"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
      />
    </Svg>
  );
}

function ChevronIcon({ color, size = 14 }: { color: string; size?: number }) {
  return (
    <Svg
      width={(size * 8) / 14}
      height={size}
      viewBox="0 0 8 14"
      fill="none"
    >
      <Path
        d="m1.5 1 5 6-5 6"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
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
  const [searchFocused, setSearchFocused] = useState(false);
  const [assigningId, setAssigningId] = useState<number | null>(null);
  const { height: kbHeight } = useReanimatedKeyboardAnimation();

  const dockAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: kbHeight.value }],
  }));

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
        pageSize: 50,
      }),
  );

  const sections = useMemo(() => {
    const buckets: Record<BracketKey, RefCandidate[]> = {
      close: [],
      med: [],
      far: [],
    };
    for (const c of data?.results ?? []) {
      const km = parseFloat(c.distanceKm.replace(",", "."));
      const b = Number.isFinite(km) ? bracketFor(km) : "far";
      buckets[b].push(c);
    }
    return (["close", "med", "far"] as const)
      .filter((key) => buckets[key].length > 0)
      .map((key) => ({
        key,
        title: bracketLabel(key),
        data: buckets[key],
      }));
  }, [data]);

  function handleClose() {
    setSearch("");
    setAssigningId(null);
    onClose();
  }

  async function performAssign(candidate: RefCandidate) {
    if (!game) return;
    setAssigningId(candidate.srId);
    try {
      await refereeApi.assignReferee(game.apiMatchId, {
        slotNumber,
        refereeApiId: candidate.srId,
      });
      await onSuccess();
      handleClose();
      Alert.alert(
        i18n.t("refereeGame.admin.assignSuccess"),
        `${candidate.vorname} ${candidate.nachName}`,
      );
    } catch (error) {
      const message =
        error instanceof APIError
          ? error.message
          : i18n.t("refereeGame.admin.assignFailed");
      Alert.alert(i18n.t("refereeGame.admin.assignFailed"), message);
      setAssigningId(null);
    }
  }

  function confirmAssign(candidate: RefCandidate) {
    const fullName = `${candidate.vorname} ${candidate.nachName}`;
    const slotLabel = slotNumber === 1 ? "SR1" : "SR2";
    Alert.alert(
      i18n.t("refereeGame.admin.assignConfirmTitle", { name: fullName }),
      i18n.t("refereeGame.admin.assignConfirmMessage", { slot: slotLabel }),
      [
        { text: i18n.t("refereeGame.admin.cancel"), style: "cancel" },
        {
          text: i18n.t("refereeGame.admin.assign"),
          onPress: () => {
            void performAssign(candidate);
          },
        },
      ],
    );
  }

  const slotLabel = slotNumber === 1 ? "SR1" : "SR2";
  const title = i18n.t("refereeGame.admin.assignTitle", { slot: slotLabel });

  const emptyState =
    !isLoading && (data?.results.length ?? 0) === 0 ? (
      <View
        style={{
          paddingHorizontal: spacing.xl,
          paddingVertical: spacing["2xl"],
          alignItems: "center",
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
    ) : null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        {/* Header: slot chip + close X */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: spacing.lg,
            paddingTop: spacing.md,
            paddingBottom: spacing.xs,
          }}
        >
          <View
            style={{
              backgroundColor: colors.primary,
              paddingHorizontal: spacing.sm,
              paddingVertical: 5,
              borderRadius: radius.md,
            }}
          >
            <Text
              style={[textStyles.label, { color: colors.primaryForeground }]}
            >
              {slotLabel}
            </Text>
          </View>
          <Pressable
            onPress={handleClose}
            hitSlop={10}
            accessibilityLabel={i18n.t("refereeGame.admin.cancel")}
            style={({ pressed }) => ({
              width: 32,
              height: 32,
              borderRadius: 16,
              backgroundColor: colors.surfaceHigh,
              alignItems: "center",
              justifyContent: "center",
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <CloseIcon color={colors.mutedForeground} size={12} />
          </Pressable>
        </View>

        {/* Title */}
        <Text
          style={[
            textStyles.sectionTitle,
            {
              color: colors.foreground,
              paddingHorizontal: spacing.lg,
              paddingTop: spacing.sm,
              paddingBottom: spacing.sm,
            },
          ]}
        >
          {title}
        </Text>

        {/* Match card */}
        {game ? (
          <View
            style={{
              marginHorizontal: spacing.lg,
              marginBottom: spacing.sm,
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.sm,
              backgroundColor: colors.card,
              borderRadius: radius.md,
              borderWidth: 1,
              borderColor: colors.border,
              flexDirection: "row",
              alignItems: "center",
              gap: spacing.sm,
            }}
          >
            <Text
              style={{
                flex: 1,
                fontFamily: fontFamilies.bodySemiBold,
                fontSize: 13,
                color: colors.foreground,
              }}
              numberOfLines={1}
            >
              {game.homeTeamName}
              <Text
                style={{
                  fontFamily: fontFamilies.body,
                  color: colors.mutedForeground,
                }}
              >
                {" "}
                {i18n.t("common.vs")}{" "}
              </Text>
              {game.guestTeamName}
            </Text>
            <Text
              style={{
                fontFamily: fontFamilies.bodyMedium,
                fontSize: 12,
                color: colors.mutedForeground,
              }}
            >
              {game.kickoffDate}
            </Text>
          </View>
        ) : null}

        {/* Results */}
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
        ) : (
          <SectionList
            sections={sections}
            keyExtractor={(item) => String(item.srId)}
            stickySectionHeadersEnabled
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            contentContainerStyle={{ paddingBottom: 88 }}
            ListEmptyComponent={emptyState}
            renderSectionHeader={({ section }) => (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: spacing.sm,
                  paddingHorizontal: spacing.lg,
                  paddingTop: spacing.md,
                  paddingBottom: spacing.xs,
                  backgroundColor: colors.background,
                }}
              >
                <View
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: bracketColor(section.key, colors),
                  }}
                />
                <Text
                  style={[
                    textStyles.tableHeader,
                    { color: colors.mutedForeground },
                  ]}
                >
                  {section.title}
                </Text>
                <View
                  style={{
                    flex: 1,
                    height: 1,
                    backgroundColor: colors.border,
                  }}
                />
                <Text
                  style={{
                    fontFamily: fontFamilies.bodyMedium,
                    fontSize: 11,
                    color: colors.mutedForeground,
                  }}
                >
                  {section.data.length}
                </Text>
              </View>
            )}
            renderItem={({ item }) => {
              const km = parseFloat(item.distanceKm.replace(",", "."));
              const bucket = Number.isFinite(km) ? bracketFor(km) : "far";
              const pillColor = bracketColor(bucket, colors);
              const palette = avatarPalette(
                `${item.vorname}${item.nachName}`,
                colors,
              );
              const grade =
                slotNumber === 1 ? item.qmaxSr1 : item.qmaxSr2;
              const isAssigning = assigningId === item.srId;
              const anyAssigning = assigningId !== null;
              return (
                <Pressable
                  onPress={() => confirmAssign(item)}
                  disabled={anyAssigning}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.vorname} ${item.nachName}, ${item.distanceKm} km`}
                  style={({ pressed }) => ({
                    marginHorizontal: spacing.sm,
                    paddingHorizontal: spacing.sm,
                    paddingVertical: spacing.sm + 2,
                    borderRadius: radius.md,
                    backgroundColor: pressed
                      ? colors.surfaceHigh
                      : "transparent",
                    opacity: anyAssigning && !isAssigning ? 0.4 : 1,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: spacing.sm,
                  })}
                >
                  <View
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 20,
                      backgroundColor: palette.bg,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: fontFamilies.displayMedium,
                        fontSize: 13,
                        color: palette.fg,
                        letterSpacing: 0.5,
                      }}
                    >
                      {initials(item)}
                    </Text>
                  </View>

                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text
                      style={{
                        fontFamily: fontFamilies.bodySemiBold,
                        fontSize: 15,
                        color: colors.foreground,
                      }}
                      numberOfLines={1}
                    >
                      {item.vorname} {item.nachName}
                    </Text>
                    {grade || item.ort ? (
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 6,
                          marginTop: 2,
                        }}
                      >
                        {grade ? (
                          <View
                            style={{
                              backgroundColor: colors.surfaceHigh,
                              paddingHorizontal: 5,
                              paddingVertical: 1,
                              borderRadius: 3,
                            }}
                          >
                            <Text
                              style={{
                                fontFamily: fontFamilies.displayMedium,
                                fontSize: 10,
                                color: colors.foreground,
                                letterSpacing: 0.3,
                              }}
                            >
                              {grade}
                            </Text>
                          </View>
                        ) : null}
                        {item.ort ? (
                          <Text
                            style={{
                              flex: 1,
                              fontFamily: fontFamilies.body,
                              fontSize: 12,
                              color: colors.mutedForeground,
                            }}
                            numberOfLines={1}
                          >
                            {item.ort}
                          </Text>
                        ) : null}
                      </View>
                    ) : null}
                    {item.warning.length > 0 ? (
                      <Text
                        style={{
                          fontFamily: fontFamilies.bodyMedium,
                          fontSize: 11,
                          color: colors.destructive,
                          marginTop: 3,
                        }}
                        numberOfLines={1}
                      >
                        ⚠  {item.warning[0]}
                      </Text>
                    ) : null}
                  </View>

                  <View
                    style={{
                      paddingHorizontal: spacing.sm,
                      paddingVertical: 4,
                      borderRadius: radius.pill,
                      backgroundColor: pillColor + "22",
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: fontFamilies.bodyMedium,
                        fontSize: 11,
                        color: pillColor,
                      }}
                    >
                      {item.distanceKm} km
                    </Text>
                  </View>

                  {isAssigning ? (
                    <ActivityIndicator
                      size="small"
                      color={colors.mutedForeground}
                    />
                  ) : (
                    <ChevronIcon color={colors.mutedForeground} />
                  )}
                </Pressable>
              );
            }}
          />
        )}

        {/* Floating search bar — absolute so it doesn't reserve layout space */}
        <Animated.View
          pointerEvents="box-none"
          style={[
            {
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              paddingHorizontal: spacing.xl,
              paddingTop: spacing.sm,
              paddingBottom: spacing.md,
            },
            dockAnimatedStyle,
          ]}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "stretch",
              gap: spacing.sm,
            }}
          >
            <View
              style={{
                flex: 1,
                flexDirection: "row",
                alignItems: "center",
                gap: spacing.sm,
                backgroundColor: colors.card,
                borderRadius: radius.pill,
                paddingHorizontal: spacing.md,
                paddingVertical: Platform.OS === "ios" ? 12 : 8,
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.1,
                shadowRadius: 12,
                elevation: 6,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <SearchIcon color={colors.mutedForeground} />
              <TextInput
                value={search}
                onChangeText={setSearch}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
                placeholder={i18n.t("refereeGame.admin.searchPlaceholder")}
                placeholderTextColor={colors.mutedForeground}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
                style={{
                  flex: 1,
                  fontFamily: fontFamilies.body,
                  fontSize: 16,
                  color: colors.foreground,
                  paddingVertical: 0,
                }}
              />
            </View>
            {search.length > 0 || searchFocused ? (
              <Pressable
                onPress={() => {
                  setSearch("");
                  Keyboard.dismiss();
                }}
                hitSlop={8}
                accessibilityLabel={i18n.t("refereeGame.admin.cancel")}
                style={({ pressed }) => ({
                  aspectRatio: 1,
                  borderRadius: radius.pill,
                  backgroundColor: colors.card,
                  borderWidth: 1,
                  borderColor: colors.border,
                  alignItems: "center",
                  justifyContent: "center",
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.1,
                  shadowRadius: 12,
                  elevation: 6,
                  opacity: pressed ? 0.6 : 1,
                })}
              >
                <CloseIcon color={colors.mutedForeground} size={14} />
              </Pressable>
            ) : null}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}
