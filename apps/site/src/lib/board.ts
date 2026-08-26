/**
 * The § 26 BGB board as the Impressum states it. Hardcoded on purpose: a legal
 * notice should not go stale or blank because the CMS is unreachable or a
 * document got unpublished. The cost is drift — /dragons/team/ renders the same
 * board from the CMS `vorstand` collection — so the build compares the two and
 * fails when they disagree (#270). The Impressum lists only the representative
 * board; other roles (Kassenwart and the like) live in the CMS alone.
 */
export type ImpressumBoardMember = { name: string; role: string };

export const IMPRESSUM_BOARD: ImpressumBoardMember[] = [
  { name: "Kianusch Pour Rahimi", role: "1. Vorsitzender" },
  { name: "Talha Diş", role: "stellv. Vorsitzender" },
];

export type CmsBoardMember = { role: string; person?: { name: string } | null };

/** A CMS role that has to appear on the Impressum. */
const REPRESENTATIVE = /vorsitz/i;

/**
 * Human-readable differences between the Impressum board and the CMS one.
 * Empty means they agree — or that the collection is empty, which is the
 * env-less build rather than a board change (#269 covers empty collections).
 */
export function boardMismatches(cmsBoard: CmsBoardMember[]): string[] {
  if (cmsBoard.length === 0) return [];

  const problems: string[] = [];
  const representatives = cmsBoard.filter((entry) => REPRESENTATIVE.test(entry.role));

  for (const stated of IMPRESSUM_BOARD) {
    const match = representatives.find((entry) => entry.role.trim() === stated.role);
    if (!match) {
      problems.push(`Impressum names "${stated.role}", the CMS has no such Vorstand role`);
      continue;
    }
    const name = match.person?.name?.trim();
    if (!name) {
      problems.push(`CMS "${match.role}" has no person attached`);
    } else if (name !== stated.name) {
      problems.push(`"${stated.role}": Impressum says ${stated.name}, CMS says ${name}`);
    }
  }

  for (const entry of representatives) {
    if (!IMPRESSUM_BOARD.some((stated) => stated.role === entry.role.trim())) {
      problems.push(`CMS has Vorstand role "${entry.role}", the Impressum does not name it`);
    }
  }

  return problems;
}
