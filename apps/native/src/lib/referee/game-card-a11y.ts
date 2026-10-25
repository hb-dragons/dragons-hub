import type { RefereeGameListItem } from "@dragons/shared";
import { buildMatchA11yLabel, type Translate } from "@/lib/ui/match-a11y";
import { refereeGameTeamNames } from "@/lib/referee/einsatz";

type SlotNumber = 1 | 2;

type CardGame = Pick<
  RefereeGameListItem,
  | "homeTeamName"
  | "guestTeamName"
  | "homeTeamCustomName"
  | "guestTeamCustomName"
  | "kickoffDate"
  | "kickoffTime"
  | "isCancelled"
  | "isForfeited"
  | "leagueShort"
  | "venueName"
  | "sr1Name"
  | "sr2Name"
  | "sr1Status"
  | "sr2Status"
>;

/**
 * What a referee game card says to VoiceOver/TalkBack: the fixture sentence
 * every game card uses, then league, hall and who holds each slot — the facts
 * the card draws, in the order a referee scans them.
 */
export function refereeGameA11yLabel(game: CardGame, t: Translate, dateLocale: string): string {
  const names = refereeGameTeamNames(game);
  const fixture = buildMatchA11yLabel(
    {
      homeName: names.home,
      guestName: names.guest,
      homeScore: null,
      guestScore: null,
      kickoffDate: game.kickoffDate,
      kickoffTime: game.kickoffTime,
      isCancelled: game.isCancelled,
      isForfeited: game.isForfeited,
    },
    t,
    dateLocale,
  );
  const slot = (n: SlotNumber, name: string | null) =>
    t("a11y.refereeSlot.holder", {
      slot: t(n === 1 ? "refereeGame.sr1Short" : "refereeGame.sr2Short"),
      name: name ?? t("refereeGame.unassigned"),
    });

  return [fixture, game.leagueShort, game.venueName, slot(1, game.sr1Name), slot(2, game.sr2Name)]
    .filter((part): part is string => Boolean(part))
    .join(", ");
}

/** One admin slot action, as a custom accessibility action on the card. */
export interface AdminSlotA11yAction {
  /** Stable action name, matched in `onAccessibilityAction`. */
  name: `assign-${SlotNumber}` | `unassign-${SlotNumber}`;
  label: string;
  kind: "assign" | "unassign";
  slotNumber: SlotNumber;
  /** The referee an unassign removes; set only for `unassign`. */
  refereeName?: string;
}

/**
 * The admin's assign/remove buttons, restated as custom actions on the card.
 *
 * The card is one accessible element (it opens the Einsatz screen), and iOS
 * does not let VoiceOver focus a button nested inside another — so without
 * these the slot buttons are reachable by touch only. Each action mirrors the
 * button `RefereeGameCard` draws for that slot: "remove" on an assigned slot
 * with a name, "assign" on an open one, nothing otherwise.
 */
export function adminSlotA11yActions(
  game: Pick<RefereeGameListItem, "sr1Name" | "sr2Name" | "sr1Status" | "sr2Status">,
  t: Translate,
): AdminSlotA11yAction[] {
  const slots: { slotNumber: SlotNumber; status: RefereeGameListItem["sr1Status"]; name: string | null }[] = [
    { slotNumber: 1, status: game.sr1Status, name: game.sr1Name },
    { slotNumber: 2, status: game.sr2Status, name: game.sr2Name },
  ];

  return slots.flatMap(({ slotNumber, status, name }): AdminSlotA11yAction[] => {
    if (status === "assigned" && name) {
      return [
        {
          name: `unassign-${slotNumber}`,
          label: t("a11y.refereeSlot.remove", {
            name,
            slot: t(slotNumber === 1 ? "refereeGame.sr1Short" : "refereeGame.sr2Short"),
          }),
          kind: "unassign",
          slotNumber,
          refereeName: name,
        },
      ];
    }
    if (status === "open") {
      return [
        {
          name: `assign-${slotNumber}`,
          label: t(slotNumber === 1 ? "refereeGame.admin.assignSr1" : "refereeGame.admin.assignSr2"),
          kind: "assign",
          slotNumber,
        },
      ];
    }
    return [];
  });
}
