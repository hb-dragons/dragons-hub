export interface SlotResolverRefereeFlags {
  allowAllHomeGames: boolean;
  allowAwayGames: boolean;
}

export interface SlotResolverGame {
  sr1OurClub: boolean;
  sr1Status: string;
  sr2OurClub: boolean;
  sr2Status: string;
  isHomeGame: boolean;
  homeTeamId: number | null;
}

export interface SlotResolverRule {
  teamId: number;
  deny: boolean;
  allowSr1: boolean;
  allowSr2: boolean;
}

export function resolveClaimableSlots(
  game: SlotResolverGame,
  referee: SlotResolverRefereeFlags,
  rules: SlotResolverRule[],
): (1 | 2)[] {
  const slots: (1 | 2)[] = [];

  const sr1Open = game.sr1OurClub && game.sr1Status === "open";
  const sr2Open = game.sr2OurClub && game.sr2Status === "open";

  if (game.isHomeGame) {
    if (referee.allowAllHomeGames) {
      const denied =
        game.homeTeamId != null &&
        rules.some((r) => r.deny && r.teamId === game.homeTeamId);
      if (denied) return slots;
      if (sr1Open) slots.push(1);
      if (sr2Open) slots.push(2);
      return slots;
    }

    if (game.homeTeamId == null) return slots;
    const rule = rules.find((r) => !r.deny && r.teamId === game.homeTeamId);
    if (!rule) return slots;
    if (rule.allowSr1 && sr1Open) slots.push(1);
    if (rule.allowSr2 && sr2Open) slots.push(2);
    return slots;
  }

  if (!referee.allowAwayGames) return slots;
  if (sr1Open) slots.push(1);
  if (sr2Open) slots.push(2);
  return slots;
}
