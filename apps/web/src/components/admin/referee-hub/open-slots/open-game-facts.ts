import type { RefereeGameListItem, RefereeSlotStatus } from "@dragons/shared";

/**
 * The game from our side: our team, the opponent, and whether we host. Our
 * team uses its club-facing name ("Herren 1") when the linked match has one,
 * since that is how the club refers to it.
 */
export function ownSide(g: RefereeGameListItem) {
  const home = g.homeTeamCustomName ?? g.homeTeamName;
  const guest = g.guestTeamCustomName ?? g.guestTeamName;
  return g.isHomeGame
    ? { own: home, opponent: guest, home: true }
    : { own: guest, opponent: home, home: false };
}

export interface OurSlot {
  n: 1 | 2;
  status: RefereeSlotStatus;
  name: string | null;
}

/** The referee slots our club has to fill on this game. */
export function ourSlots(g: RefereeGameListItem): OurSlot[] {
  const slots: OurSlot[] = [];
  if (g.sr1OurClub) slots.push({ n: 1, status: g.sr1Status, name: g.sr1Name });
  if (g.sr2OurClub) slots.push({ n: 2, status: g.sr2Status, name: g.sr2Name });
  return slots;
}

/** Our slots that still need a referee: open, or offered and not yet taken. */
export function openSlotCount(g: RefereeGameListItem): number {
  return ourSlots(g).filter((s) => s.status !== "assigned").length;
}
