import { useState } from "react";
import { View, Text, Pressable, ActivityIndicator, Alert } from "react-native";
import { mutate as globalMutate } from "swr";
import { APIError } from "@dragons/api-client";
import type { RefereeGameListItem } from "@dragons/shared";
import { useTheme } from "../hooks/useTheme";
import { refereeApi } from "../lib/api";
import { i18n } from "../lib/i18n";

interface ClaimGameButtonProps {
  game: RefereeGameListItem;
  /** Extra SWR keys to revalidate on success (the list view's key, for example). */
  revalidateKeys?: string[];
  /** Callback after a successful claim or drop, fired before the success alert. */
  onChanged?: () => void | Promise<void>;
}

function slotLabelKey(slotNumber: 1 | 2): "refereeGame.takeSr1" | "refereeGame.takeSr2" {
  return slotNumber === 1 ? "refereeGame.takeSr1" : "refereeGame.takeSr2";
}

/** Open our-club slots — candidates for claiming, subject to server verification. */
function openOurClubSlots(game: RefereeGameListItem): (1 | 2)[] {
  const slots: (1 | 2)[] = [];
  if (game.sr1OurClub && game.sr1Status === "open") slots.push(1);
  if (game.sr2OurClub && game.sr2Status === "open") slots.push(2);
  return slots;
}

function claimErrorMessage(error: unknown): string {
  if (error instanceof APIError) {
    if (error.code === "SLOT_TAKEN") return i18n.t("refereeGame.takeFailedSlotTaken");
    if (
      error.code === "NOT_QUALIFIED" ||
      error.code === "DENY_RULE" ||
      error.code === "NOT_OWN_CLUB"
    ) {
      return i18n.t("refereeGame.takeFailedNotQualified");
    }
    if (error.code === "FEDERATION_ERROR") {
      return i18n.t("refereeGame.takeFailedFederation");
    }
  }
  return i18n.t("refereeGame.takeFailed");
}

function dropErrorMessage(error: unknown): string {
  if (error instanceof APIError) {
    if (error.code === "NOT_ASSIGNED") return i18n.t("refereeGame.dropFailedNotAssigned");
    if (error.code === "FEDERATION_ERROR") {
      return i18n.t("refereeGame.dropFailedFederation");
    }
  }
  return i18n.t("refereeGame.dropFailed");
}

export function ClaimGameButton({
  game,
  revalidateKeys,
  onChanged,
}: ClaimGameButtonProps) {
  const { colors, textStyles, spacing, radius } = useTheme();
  const [busy, setBusy] = useState<1 | 2 | "drop" | null>(null);

  const isAssigned = game.mySlot !== null;

  async function revalidate() {
    if (onChanged) await onChanged();
    await Promise.all((revalidateKeys ?? []).map((k) => globalMutate(k)));
  }

  async function performClaim(slotNumber: 1 | 2) {
    setBusy(slotNumber);
    try {
      await refereeApi.claimGame(game.id, { slotNumber });
      await revalidate();
      Alert.alert(i18n.t("refereeGame.takeSuccess"));
    } catch (e) {
      Alert.alert(i18n.t("refereeGame.takeFailed"), claimErrorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function performDrop() {
    setBusy("drop");
    try {
      await refereeApi.unclaimGame(game.id);
      await revalidate();
      Alert.alert(i18n.t("refereeGame.dropSuccess"));
    } catch (e) {
      Alert.alert(i18n.t("refereeGame.dropFailed"), dropErrorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  function confirmClaim(slotNumber: 1 | 2) {
    Alert.alert(
      i18n.t("refereeGame.takeConfirmTitle"),
      i18n.t("refereeGame.takeConfirmMessage"),
      [
        { text: i18n.t("common.cancel"), style: "cancel" },
        {
          text: i18n.t(slotLabelKey(slotNumber)),
          style: "default",
          onPress: () => {
            void performClaim(slotNumber);
          },
        },
      ],
    );
  }

  function confirmDrop() {
    Alert.alert(
      i18n.t("refereeGame.dropConfirmTitle"),
      i18n.t("refereeGame.dropConfirmMessage"),
      [
        { text: i18n.t("common.cancel"), style: "cancel" },
        {
          text: i18n.t("refereeGame.dropConfirmAction"),
          style: "destructive",
          onPress: () => {
            void performDrop();
          },
        },
      ],
    );
  }

  if (isAssigned) {
    if (game.isCancelled || game.isForfeited) return null;

    const isBusy = busy === "drop";
    const disabled = busy !== null;

    return (
      <Pressable
        onPress={confirmDrop}
        disabled={disabled}
        style={({ pressed }) => [
          {
            backgroundColor: "transparent",
            borderRadius: radius.md,
            borderWidth: 1,
            borderColor: colors.destructive,
            paddingVertical: spacing.md,
            alignItems: "center",
          },
          disabled && { opacity: 0.6 },
          pressed && !disabled ? { opacity: 0.75 } : null,
        ]}
      >
        {isBusy ? (
          <ActivityIndicator color={colors.destructive} />
        ) : (
          <Text style={[textStyles.button, { color: colors.destructive }]}>
            {i18n.t("refereeGame.drop")}
          </Text>
        )}
      </Pressable>
    );
  }

  if (game.isCancelled || game.isForfeited) return null;

  const candidateSlots = openOurClubSlots(game);
  if (candidateSlots.length === 0) return null;

  // If the server provided `claimableSlots`, use it to know which candidate
  // slots are actually claimable. If it's missing (older API), we can't verify
  // — render the button disabled so the user isn't misled.
  const serverClaimable = game.claimableSlots;
  function isClaimable(slot: 1 | 2): boolean {
    return serverClaimable !== undefined && serverClaimable.includes(slot);
  }

  function SlotButton({ slotNumber }: { slotNumber: 1 | 2 }) {
    const claimable = isClaimable(slotNumber);
    const isBusy = busy === slotNumber;
    const disabled = busy !== null || !claimable;
    return (
      <Pressable
        onPress={() => confirmClaim(slotNumber)}
        disabled={disabled}
        style={({ pressed }) => [
          {
            flex: 1,
            backgroundColor: colors.primary,
            borderRadius: radius.md,
            paddingVertical: spacing.md,
            alignItems: "center",
          },
          !claimable && { opacity: 0.4 },
          disabled && claimable && { opacity: 0.6 },
          pressed && !disabled ? { opacity: 0.85 } : null,
        ]}
      >
        {isBusy ? (
          <ActivityIndicator color={colors.primaryForeground} />
        ) : (
          <Text style={[textStyles.button, { color: colors.primaryForeground }]}>
            {i18n.t(slotLabelKey(slotNumber))}
          </Text>
        )}
      </Pressable>
    );
  }

  if (candidateSlots.length > 1) {
    return (
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <SlotButton slotNumber={1} />
        <SlotButton slotNumber={2} />
      </View>
    );
  }

  return <SlotButton slotNumber={candidateSlots[0]!} />;
}
