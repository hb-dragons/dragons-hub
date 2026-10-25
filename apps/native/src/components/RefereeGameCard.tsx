import { View, Text, Pressable } from "react-native";
import { resolveDateLocale, type RefereeGameListItem } from "@dragons/shared";
import { useTheme } from "../hooks/useTheme";
import { i18n } from "../lib/i18n";
import { kickoffCompact } from "../lib/format/kickoff";
import { refereeGameTeamNames } from "../lib/referee/einsatz";
import { adminSlotA11yActions, refereeGameA11yLabel } from "../lib/referee/game-card-a11y";
import { MIN_TAP_TARGET, tapTargetSlop } from "../lib/ui/a11y";
import { fontFamilies } from "../theme/typography";

interface RefereeGameCardProps {
  game: RefereeGameListItem;
  onPress?: () => void;
  isAdmin?: boolean;
  onAdminAssign?: (slotNumber: 1 | 2) => void;
  onAdminUnassign?: (slotNumber: 1 | 2, refereeName: string) => void;
}

interface SlotRowProps {
  label: string;
  name: string | null;
  status: RefereeGameListItem["sr1Status"];
  isMine: boolean;
  ourClub: boolean;
}

function SlotRow({ label, name, status, isMine, ourClub }: SlotRowProps) {
  const { colors, spacing, radius } = useTheme();

  const display = name ?? i18n.t("refereeGame.unassigned");

  const statusColor = isMine
    ? colors.primary
    : status === "assigned"
      ? colors.foreground
      : status === "offered"
        ? colors.heat
        : colors.mutedForeground;

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.xs,
      }}
    >
      <Text
        style={{
          fontSize: 10,
          fontFamily: fontFamilies.bodySemiBold,
          color: colors.mutedForeground,
          minWidth: 24,
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          fontSize: 12,
          fontFamily: isMine ? fontFamilies.bodySemiBold : fontFamilies.body,
          color: statusColor,
          flex: 1,
        }}
        numberOfLines={1}
      >
        {display}
      </Text>
      {isMine ? (
        <View
          style={{
            backgroundColor: colors.primary,
            borderRadius: radius.pill,
            paddingHorizontal: spacing.sm,
            paddingVertical: 2,
          }}
        >
          <Text
            style={{
              fontSize: 9,
              fontFamily: fontFamilies.bodySemiBold,
              color: colors.primaryForeground,
              textTransform: "uppercase",
              letterSpacing: 0.5,
            }}
          >
            {i18n.t("refereeGame.mine")}
          </Text>
        </View>
      ) : ourClub && status === "open" ? (
        <Text
          style={{
            fontSize: 10,
            fontFamily: fontFamilies.bodySemiBold,
            color: colors.mutedForeground,
            textTransform: "uppercase",
            letterSpacing: 0.5,
          }}
        >
          {i18n.t("refereeGame.status.open")}
        </Text>
      ) : null}
    </View>
  );
}

/** Drawn height of a slot action: an 11pt label plus 4pt padding above and below. */
const SLOT_ACTION_HEIGHT = 22;

/** Bridges `i18n.t` to the a11y builders' `Translate` shape. */
const translate = (key: string, options?: Record<string, string | number>) => i18n.t(key, options);

interface AdminSlotActionProps {
  status: RefereeGameListItem["sr1Status"];
  name: string | null;
  slotNumber: 1 | 2;
  onAssign: (slotNumber: 1 | 2) => void;
  onUnassign: (slotNumber: 1 | 2, refereeName: string) => void;
}

function AdminSlotAction({
  status,
  name,
  slotNumber,
  onAssign,
  onUnassign,
}: AdminSlotActionProps) {
  const { colors, spacing, radius } = useTheme();

  if (status === "assigned" && name) {
    return (
      <Pressable
        onPress={() => onUnassign(slotNumber, name)}
        accessibilityRole="button"
        accessibilityLabel={i18n.t("a11y.refereeSlot.remove", {
          name,
          slot: i18n.t(slotNumber === 1 ? "refereeGame.sr1Short" : "refereeGame.sr2Short"),
        })}
        hitSlop={tapTargetSlop(MIN_TAP_TARGET, SLOT_ACTION_HEIGHT)}
        style={({ pressed }) => ({
          paddingHorizontal: spacing.sm,
          paddingVertical: 4,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: colors.destructive + "55",
          opacity: pressed ? 0.7 : 1,
        })}
      >
        <Text
          style={{
            fontSize: 11,
            fontFamily: fontFamilies.bodySemiBold,
            color: colors.destructive,
            textTransform: "uppercase",
            letterSpacing: 0.5,
          }}
        >
          {i18n.t("refereeGame.admin.remove")}
        </Text>
      </Pressable>
    );
  }

  if (status === "open") {
    const labelKey =
      slotNumber === 1
        ? "refereeGame.admin.assignSr1"
        : "refereeGame.admin.assignSr2";
    return (
      <Pressable
        onPress={() => onAssign(slotNumber)}
        accessibilityRole="button"
        hitSlop={tapTargetSlop(MIN_TAP_TARGET, SLOT_ACTION_HEIGHT)}
        style={({ pressed }) => ({
          paddingHorizontal: spacing.sm,
          paddingVertical: 4,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: colors.primary + "55",
          opacity: pressed ? 0.7 : 1,
        })}
      >
        <Text
          style={{
            fontSize: 11,
            fontFamily: fontFamilies.bodySemiBold,
            color: colors.primary,
            textTransform: "uppercase",
            letterSpacing: 0.5,
          }}
        >
          {i18n.t(labelKey)}
        </Text>
      </Pressable>
    );
  }

  return null;
}

export function RefereeGameCard({
  game,
  onPress,
  isAdmin = false,
  onAdminAssign,
  onAdminUnassign,
}: RefereeGameCardProps) {
  const { colors, radius, spacing, isDark } = useTheme();
  const teamNames = refereeGameTeamNames(game);

  const isAssignedToMe = game.mySlot !== null;

  const cardBg = isAssignedToMe
    ? isDark
      ? "rgba(0,75,35,0.16)"
      : "rgba(0,75,35,0.08)"
    : colors.surfaceLowest;

  const content = (
    <View
      style={{
        backgroundColor: cardBg,
        borderRadius: radius.md,
        padding: spacing.md,
        borderWidth: isAssignedToMe ? 1 : 0,
        borderColor: isAssignedToMe ? colors.primary + "60" : "transparent",
        gap: spacing.sm,
      }}
    >
      {/* Header: date + league */}
      <View
        style={{ flexDirection: "row", justifyContent: "space-between" }}
      >
        <Text
          style={{
            fontSize: 11,
            fontFamily: fontFamilies.body,
            color: colors.mutedForeground,
          }}
        >
          {kickoffCompact(game.kickoffDate, game.kickoffTime)}
        </Text>
        {game.leagueShort ? (
          <Text
            style={{
              fontSize: 11,
              fontFamily: fontFamilies.bodySemiBold,
              color: colors.mutedForeground,
            }}
            numberOfLines={1}
          >
            {game.leagueShort}
          </Text>
        ) : null}
      </View>

      {/* Teams */}
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Text
          style={{
            fontSize: 14,
            fontFamily: fontFamilies.bodySemiBold,
            color: colors.foreground,
            flex: 1,
          }}
          numberOfLines={1}
        >
          {teamNames.home}
        </Text>
        <Text
          style={{
            fontSize: 12,
            fontFamily: fontFamilies.body,
            color: colors.mutedForeground,
            marginHorizontal: spacing.xs,
          }}
        >
          {i18n.t("common.vs")}
        </Text>
        <Text
          style={{
            fontSize: 14,
            fontFamily: fontFamilies.body,
            color: colors.foreground,
            flex: 1,
            textAlign: "right",
          }}
          numberOfLines={1}
        >
          {teamNames.guest}
        </Text>
      </View>

      {/* Venue */}
      {game.venueName ? (
        <Text
          style={{
            fontSize: 11,
            fontFamily: fontFamilies.body,
            color: colors.mutedForeground,
          }}
          numberOfLines={1}
        >
          {game.venueName}
        </Text>
      ) : null}

      {/* Referee slots */}
      <View
        style={{
          borderTopWidth: 1,
          borderTopColor: colors.border,
          paddingTop: spacing.sm,
          gap: spacing.xs,
        }}
      >
        <View
          style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}
        >
          <View style={{ flex: 1 }}>
            <SlotRow
              label={i18n.t("refereeGame.sr1Short")}
              name={game.sr1Name}
              status={game.sr1Status}
              isMine={game.mySlot === 1}
              ourClub={game.sr1OurClub}
            />
          </View>
          {isAdmin && !game.isCancelled && !game.isForfeited && onAdminAssign && onAdminUnassign ? (
            <AdminSlotAction
              status={game.sr1Status}
              name={game.sr1Name}
              slotNumber={1}
              onAssign={onAdminAssign}
              onUnassign={onAdminUnassign}
            />
          ) : null}
        </View>
        <View
          style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}
        >
          <View style={{ flex: 1 }}>
            <SlotRow
              label={i18n.t("refereeGame.sr2Short")}
              name={game.sr2Name}
              status={game.sr2Status}
              isMine={game.mySlot === 2}
              ourClub={game.sr2OurClub}
            />
          </View>
          {isAdmin && !game.isCancelled && !game.isForfeited && onAdminAssign && onAdminUnassign ? (
            <AdminSlotAction
              status={game.sr2Status}
              name={game.sr2Name}
              slotNumber={2}
              onAssign={onAdminAssign}
              onUnassign={onAdminUnassign}
            />
          ) : null}
        </View>
      </View>
    </View>
  );

  if (onPress) {
    // The card is one accessible element, and VoiceOver cannot focus the slot
    // buttons nested inside it — so an admin gets them as custom actions too.
    const slotActions =
      isAdmin && !game.isCancelled && !game.isForfeited && onAdminAssign && onAdminUnassign
        ? adminSlotA11yActions(game, translate)
        : [];
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={refereeGameA11yLabel(game, translate, resolveDateLocale(i18n.locale))}
        accessibilityActions={slotActions.map(({ name, label }) => ({ name, label }))}
        onAccessibilityAction={(event) => {
          const action = slotActions.find((a) => a.name === event.nativeEvent.actionName);
          if (!action) return;
          if (action.kind === "assign") onAdminAssign?.(action.slotNumber);
          else if (action.refereeName) onAdminUnassign?.(action.slotNumber, action.refereeName);
        }}
        style={({ pressed }) => (pressed ? { opacity: 0.85 } : undefined)}
      >
        {content}
      </Pressable>
    );
  }

  return content;
}
