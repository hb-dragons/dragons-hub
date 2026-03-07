/**
 * Diagnostic script: Inspect referee data from the Basketball-Bund API.
 *
 * For each league, fetches the spielplan and game details,
 * then prints a table showing which matches have referee assignments,
 * which slots are open, and whether it's a home game for the configured club.
 *
 * Usage (from project root):
 *   pnpm --filter @dragons/api exec tsx ../../scripts/inspect-referee-data.ts
 *
 * Optional flags:
 *   --league <ligaNr>      Only inspect a specific league by its league number (ligaNr)
 *   --home-only            Only show home games (where own club is home team)
 *   --future-only          Only show future matches (not yet played)
 *   --raw                  Dump raw JSON for the first match per league
 *   --limit <n>            Limit matches inspected per league
 *   --list                 Just list all available leagues and exit
 */

import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import BasketballBundSDK from "basketball-bund-sdk";

// Load .env from project root regardless of cwd
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env") });

const BASE_URL = "https://www.basketball-bund.net";
const SDK_USERNAME = process.env.SDK_USERNAME;
const SDK_PASSWORD = process.env.SDK_PASSWORD;

if (!SDK_USERNAME || !SDK_PASSWORD) {
  console.error("Missing SDK_USERNAME or SDK_PASSWORD in .env");
  process.exit(1);
}

// --- Parse CLI flags ---
const args = process.argv.slice(2);
const leagueFilter = args.includes("--league")
  ? Number(args[args.indexOf("--league") + 1])
  : null;
const homeOnly = args.includes("--home-only");
const futureOnly = args.includes("--future-only");
const dumpRaw = args.includes("--raw");
const listOnly = args.includes("--list");
const limit = args.includes("--limit")
  ? Number(args[args.indexOf("--limit") + 1])
  : null;

// --- Minimal SDK client (no DB dependency) ---
const sdk = new BasketballBundSDK();
let sessionCookie: string | null = null;

async function login(): Promise<void> {
  const res = await fetch(`${BASE_URL}/login.do?reqCode=login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ username: SDK_USERNAME!, password: SDK_PASSWORD! }).toString(),
    redirect: "manual",
  });

  const text = await res.text();
  if (text.includes("Die Kombination aus Benutzername und Passwort ist nicht bekannt!")) {
    throw new Error("Invalid credentials");
  }

  const setCookies = res.headers.getSetCookie();
  for (const raw of setCookies) {
    const kv = raw.split(";")[0]?.trim();
    if (kv?.startsWith("SESSION=")) {
      sessionCookie = kv;
      break;
    }
  }
  if (!sessionCookie) throw new Error("No session cookie");

  // Verify + get user context
  const verifyRes = await authFetch("/rest/user/lc");
  const userData = await verifyRes.json();
  console.log("Logged in as:", userData?.data?.loginName);
  if (userData?.data?.vereinId) {
    console.log("Club (vereinId):", userData.data.vereinId, userData.data.vereinsname ?? "");
  }
  console.log();
}

async function authFetch(path: string): Promise<Response> {
  return fetch(`${BASE_URL}${path}`, {
    headers: {
      Cookie: sessionCookie!,
      Accept: "application/json, text/plain, */*",
    },
  });
}

async function getGameDetails(matchId: number): Promise<unknown> {
  const res = await authFetch(`/rest/assignschiri/getGame/${matchId}`);
  if (!res.ok) {
    console.warn(`  getGame/${matchId} returned ${res.status}`);
    return null;
  }
  return res.json();
}

interface SpielplanMatch {
  matchId: number;
  matchDay: number;
  matchNo: number;
  kickoffDate: string;
  kickoffTime: string;
  homeTeam: { teamname: string; clubId: number } | null;
  guestTeam: { teamname: string; clubId: number } | null;
  result: string | null;
}

interface LigaListEntry {
  ligaId: number;
  liganr: number;
  liganame: string;
  skName: string;
  akName: string;
  geschlecht: string;
}

/**
 * Fetch all leagues with proper pagination using hasMoreData,
 * matching the pattern from sdkClient.getAllLigen().
 */
async function fetchAllLeagues(): Promise<LigaListEntry[]> {
  const allLigen: LigaListEntry[] = [];
  let index = 0;
  let hasMore = true;

  while (hasMore) {
    const response = (await sdk.wam.getLigaList({
      akgGeschlechtIds: [],
      altersklasseIds: [],
      gebietIds: [],
      ligatypIds: [],
      sortBy: 0,
      spielklasseIds: [],
      token: "",
      verbandIds: [7],
      startAtIndex: index,
    })) as { ligen?: LigaListEntry[]; hasMoreData?: boolean; size?: number };

    const ligen = response?.ligen ?? [];
    allLigen.push(...ligen);
    hasMore = response?.hasMoreData ?? false;
    index += response?.size ?? ligen.length;
  }

  return allLigen;
}

// --- Main ---
async function main() {
  await login();

  // Get user context to find own club
  const ucRes = await authFetch("/rest/user/lc");
  const uc = await ucRes.json();
  const ownClubId: number | null = uc?.data?.vereinId ?? null;

  // Fetch all available leagues from API (with proper pagination)
  console.log("Fetching league list from API...");
  const allLeagues = await fetchAllLeagues();
  console.log(`Found ${allLeagues.length} leagues total\n`);

  // --list mode: just print all leagues and exit
  if (listOnly) {
    console.log("  ligaNr   ligaId   Name");
    console.log("  " + "-".repeat(70));
    for (const l of allLeagues) {
      console.log(
        `  ${String(l.liganr).padEnd(9)}${String(l.ligaId).padEnd(9)}${l.liganame ?? "(unnamed)"}`
      );
    }
    return;
  }

  // Filter by --league <ligaNr> (matches by league number, same as the admin settings API)
  let targetLeagues = allLeagues;
  if (leagueFilter) {
    // Try matching by ligaNr first (how the admin UI configures leagues)
    targetLeagues = allLeagues.filter((l) => l.liganr === leagueFilter);

    // Fallback: also try matching by ligaId if ligaNr didn't match
    if (targetLeagues.length === 0) {
      targetLeagues = allLeagues.filter((l) => l.ligaId === leagueFilter);
    }

    if (targetLeagues.length === 0) {
      console.error(`League number ${leagueFilter} not found. Use --list to see all leagues.`);
      process.exit(1);
    }
  }

  // If no specific league requested, try club matches endpoint to find relevant leagues
  if (!leagueFilter && ownClubId) {
    console.log(`Fetching recent matches for club ${ownClubId} to find relevant leagues...\n`);

    try {
      const clubMatchesRes = (await sdk.club.getActualMatches({ clubId: ownClubId, rangeDays: 365 })) as {
        matches?: Array<SpielplanMatch & { ligaData?: { ligaId: number; name: string } }>;
      };
      const clubMatches = clubMatchesRes?.matches ?? [];

      const leagueIds = new Set<number>();
      for (const m of clubMatches) {
        if (m.ligaData?.ligaId) leagueIds.add(m.ligaData.ligaId);
      }

      if (leagueIds.size > 0) {
        console.log(`  Club has matches in ${leagueIds.size} league(s):`);
        targetLeagues = allLeagues.filter((l) => leagueIds.has(l.ligaId));
        for (const l of targetLeagues) {
          console.log(`    ligaNr=${l.liganr} ligaId=${l.ligaId}: ${l.liganame}`);
        }
        console.log();
      } else {
        console.log("  No club matches found via club endpoint.\n");
        console.log("  Tip: Use --league <ligaNr> to inspect a specific league.");
        console.log("       Use --list to see all available leagues.\n");
        return;
      }
    } catch {
      console.log("  Club matches endpoint failed.\n");
      console.log("  Tip: Use --league <ligaNr> to inspect a specific league.");
      console.log("       Use --list to see all available leagues.\n");
      return;
    }
  }

  // Now inspect each target league
  for (const league of targetLeagues) {
    console.log("=".repeat(80));
    console.log(`League: ${league.liganame ?? "(unnamed)"} (ligaNr: ${league.liganr}, ligaId: ${league.ligaId})`);
    console.log(`  SK: ${league.skName ?? "-"} | AK: ${league.akName ?? "-"} | ${league.geschlecht ?? "-"}`);
    console.log("=".repeat(80));

    const spRes = (await sdk.competition.getSpielplan({ competitionId: league.ligaId })) as {
      matches?: SpielplanMatch[];
    };
    let matches = spRes?.matches ?? [];

    if (futureOnly) {
      const now = new Date();
      matches = matches.filter((m) => {
        const matchDate = new Date(`${m.kickoffDate}T${m.kickoffTime}`);
        return matchDate > now;
      });
    }

    if (homeOnly && ownClubId) {
      matches = matches.filter((m) => m.homeTeam?.clubId === ownClubId);
    }

    if (matches.length === 0) {
      console.log("  (no matches matching filters)\n");
      continue;
    }

    if (limit && matches.length > limit) {
      matches = matches.slice(0, limit);
    }

    console.log(`\n  Fetching game details for ${matches.length} matches...\n`);

    // If --raw, dump first match details as raw JSON
    if (dumpRaw && matches.length > 0) {
      const firstMatch = matches[0];
      console.log(`\n  === RAW API RESPONSE for matchId ${firstMatch.matchId} ===`);
      console.log(`  Spielplan entry:`);
      console.log(JSON.stringify(firstMatch, null, 2));
      const rawDetails = await getGameDetails(firstMatch.matchId);
      console.log(`\n  getGame/${firstMatch.matchId} response:`);
      console.log(JSON.stringify(rawDetails, null, 2));
      console.log(`  === END RAW ===\n`);
    }

    // Print header
    console.log(
      "  " +
        [
          "Date".padEnd(12),
          "Time".padEnd(6),
          "Home".padEnd(25),
          "Guest".padEnd(25),
          "Result".padEnd(8),
          "SR1".padEnd(25),
          "SR2".padEnd(25),
          "SR3".padEnd(15),
          "Open?",
        ].join(""),
    );
    console.log("  " + "-".repeat(160));

    for (const match of matches) {
      const isHomeGame = ownClubId != null && match.homeTeam?.clubId === ownClubId;
      const homeMarker = isHomeGame ? " (H)" : "";

      let sr1 = "-";
      let sr2 = "-";
      let sr3 = "-";
      const openSlots: string[] = [];

      try {
        const details = (await getGameDetails(match.matchId)) as {
          game1?: unknown;
          sr1?: { spielleitung?: { schiedsrichter?: { personVO?: { vorname: string; nachname: string } } }; offenAngeboten?: boolean };
          sr2?: { spielleitung?: { schiedsrichter?: { personVO?: { vorname: string; nachname: string } } }; offenAngeboten?: boolean };
          sr3?: { spielleitung?: { schiedsrichter?: { personVO?: { vorname: string; nachname: string } } }; offenAngeboten?: boolean };
        } | null;

        if (details) {
          for (const [label, slot] of [
            ["SR1", details.sr1],
            ["SR2", details.sr2],
            ["SR3", details.sr3],
          ] as const) {
            const person = slot?.spielleitung?.schiedsrichter?.personVO;
            const name = person ? `${person.vorname} ${person.nachname}` : "-";
            const open = slot?.offenAngeboten ? "OPEN" : "";

            if (label === "SR1") sr1 = person ? name : open || "-";
            if (label === "SR2") sr2 = person ? name : open || "-";
            if (label === "SR3") sr3 = person ? name : open || "-";

            if (slot?.offenAngeboten) openSlots.push(label);
          }
        } else {
          sr1 = sr2 = sr3 = "(no data)";
        }
      } catch {
        sr1 = sr2 = sr3 = "(error)";
      }

      console.log(
        "  " +
          [
            match.kickoffDate.padEnd(12),
            match.kickoffTime.padEnd(6),
            (match.homeTeam?.teamname ?? "TBD").substring(0, 23).padEnd(25),
            (match.guestTeam?.teamname ?? "TBD").substring(0, 23).padEnd(25),
            (match.result ?? "-").padEnd(8),
            sr1.substring(0, 23).padEnd(25),
            sr2.substring(0, 23).padEnd(25),
            sr3.substring(0, 13).padEnd(15),
            openSlots.length > 0 ? openSlots.join(",") : "-",
          ].join("") +
          homeMarker,
      );

      // Small delay to avoid hammering the API
      await new Promise((r) => setTimeout(r, 100));
    }

    console.log();

    // Summary for this league
    const totalMatches = matches.length;
    const homeMatches = ownClubId ? matches.filter((m) => m.homeTeam?.clubId === ownClubId).length : 0;
    console.log(`  Summary: ${totalMatches} matches shown, ${homeMatches} home games`);
    console.log();
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
