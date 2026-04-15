/**
 * Test script: Check if the offenespiele/search endpoint works with our credentials.
 *
 * This endpoint returns games where our club needs to provide referees.
 * It uses the same session-cookie auth as the referee game-detail endpoint.
 *
 * Usage (from project root):
 *   pnpm --filter @dragons/api exec tsx ../../scripts/test-offenespiele-api.ts
 *
 * Optional flags:
 *   --raw              Dump full raw JSON response
 *   --all              Show all games (default: only "OFFEN" / open)
 *   --vereins-spiele   Filter: STANDARD (default), ALLE, NUR_HM, NUR_AM
 *   --zeitraum         Filter: all (default), heute, woche, monat
 *   --page-size <n>    Results per page (default: 50)
 */

import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

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
const dumpRaw = args.includes("--raw");
const showAll = args.includes("--all");
const vereinsSpiele = args.includes("--vereins-spiele")
  ? args[args.indexOf("--vereins-spiele") + 1] ?? "STANDARD"
  : "STANDARD";
const zeitraum = args.includes("--zeitraum")
  ? args[args.indexOf("--zeitraum") + 1] ?? "all"
  : "all";
const pageSize = args.includes("--page-size")
  ? Number(args[args.indexOf("--page-size") + 1])
  : 50;

let sessionCookie: string | null = null;

// --- Auth ---

async function login(): Promise<void> {
  console.log("Logging in...");
  const res = await fetch(`${BASE_URL}/login.do?reqCode=login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ username: SDK_USERNAME!, password: SDK_PASSWORD! }).toString(),
    redirect: "manual",
  });

  const text = await res.text();
  if (text.includes("Die Kombination aus Benutzername und Passwort ist nicht bekannt!")) {
    throw new Error("Invalid credentials — login rejected");
  }

  const setCookies = res.headers.getSetCookie();
  for (const raw of setCookies) {
    const kv = raw.split(";")[0]?.trim();
    if (kv?.startsWith("SESSION=")) {
      sessionCookie = kv;
      break;
    }
  }
  if (!sessionCookie) throw new Error("No SESSION cookie in response");

  // Verify session
  const verifyRes = await authFetch("/rest/user/lc");
  const userData = await verifyRes.json();
  const loginName = userData?.data?.loginName;
  if (!loginName) {
    throw new Error("Session verification failed — no loginName in /rest/user/lc");
  }
  console.log(`  Logged in as: ${loginName}`);
  if (userData?.data?.vereinId) {
    console.log(`  Club: ${userData.data.vereinsname ?? "?"} (vereinId: ${userData.data.vereinId})`);
  }
  console.log();
}

async function authFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      Cookie: sessionCookie!,
      Accept: "application/json, text/plain, */*",
      ...init?.headers,
    },
  });
}

// --- offenespiele/search ---

interface OffeneSpieleSuchBody {
  ats: null;
  datum: string;
  ligaKurz: null;
  pageFrom: number;
  pageSize: number;
  sortBy: string;
  sortOrder: string;
  spielStatus: string;
  srName: null;
  vereinsDelegation: string;
  vereinsSpiele: string;
  zeitraum: string;
}

async function searchOffeneSpiele(page = 0): Promise<unknown> {
  const body: OffeneSpieleSuchBody = {
    ats: null,
    datum: new Date().toISOString(),
    ligaKurz: null,
    pageFrom: page,
    pageSize: pageSize,
    sortBy: "sp.spieldatum",
    sortOrder: "asc",
    spielStatus: showAll ? "ALLE" : "OFFEN",
    srName: null,
    vereinsDelegation: "ALLE",
    vereinsSpiele: vereinsSpiele,
    zeitraum: zeitraum,
  };

  console.log("Requesting POST /rest/offenespiele/search");
  console.log("  Payload:", JSON.stringify(body, null, 2));
  console.log();

  const res = await authFetch("/rest/offenespiele/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`offenespiele/search failed: ${res.status} ${res.statusText}\n${errText}`);
  }

  return res.json();
}

// --- Display ---

function formatDate(epochMs: number): string {
  const d = new Date(epochMs);
  return d.toLocaleDateString("de-DE", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Berlin",
  });
}

interface OffeneSpielResult {
  sp: {
    spielplanId: number;
    spielnr: number;
    spieldatum: number;
    liga: { liganame: string; ligaKurzname: string; srKurzname: string };
    heimMannschaftLiga: { mannschaftName: string };
    gastMannschaftLiga: { mannschaftName: string };
    spielfeld: { bezeichnung: string; ort: string } | null;
    sr1Verein: { vereinsname: string; vereinId: number } | null;
    sr2Verein: { vereinsname: string; vereinId: number } | null;
    sr1VereinInformiert: boolean;
    sr2VereinInformiert: boolean;
    abgesagt: boolean;
    verzicht: boolean;
  };
  sr1: { name: string; vorname: string } | null;
  sr2: { name: string; vorname: string } | null;
  sr1MeinVerein: boolean;
  sr2MeinVerein: boolean;
  sr1OffenAngeboten: boolean;
  sr2OffenAngeboten: boolean;
}

function displayResults(data: { total: number; results: OffeneSpielResult[] }): void {
  console.log(`Total results: ${data.total}`);
  console.log(`Showing: ${data.results.length}`);
  console.log("─".repeat(100));

  for (const r of data.results) {
    const sp = r.sp;
    const date = formatDate(sp.spieldatum);
    const home = sp.heimMannschaftLiga.mannschaftName;
    const away = sp.gastMannschaftLiga.mannschaftName;
    const league = sp.liga.srKurzname || sp.liga.ligaKurzname;
    const venue = sp.spielfeld ? `${sp.spielfeld.bezeichnung}, ${sp.spielfeld.ort}` : "?";

    console.log(`\n${home} vs ${away}`);
    console.log(`  ${date} | ${league} | Spiel #${sp.spielnr}`);
    console.log(`  Venue: ${venue}`);
    console.log(`  spielplanId: ${sp.spielplanId}`);

    // SR1
    const sr1Status = r.sr1
      ? `✅ ${r.sr1.vorname} ${r.sr1.name}`
      : r.sr1MeinVerein
        ? "❌ OFFEN (our club)"
        : r.sr1OffenAngeboten
          ? "⚠️  OFFEN (offered publicly)"
          : "❌ OFFEN";
    const sr1Club = sp.sr1Verein ? ` [${sp.sr1Verein.vereinsname}]` : "";
    console.log(`  SR1: ${sr1Status}${sr1Club}`);

    // SR2
    const sr2Status = r.sr2
      ? `✅ ${r.sr2.vorname} ${r.sr2.name}`
      : r.sr2MeinVerein
        ? "❌ OFFEN (our club)"
        : r.sr2OffenAngeboten
          ? "⚠️  OFFEN (offered publicly)"
          : "❌ OFFEN";
    const sr2Club = sp.sr2Verein ? ` [${sp.sr2Verein.vereinsname}]` : "";
    console.log(`  SR2: ${sr2Status}${sr2Club}`);

    if (sp.abgesagt) console.log(`  ⚠️  CANCELLED`);
    if (sp.verzicht) console.log(`  ⚠️  FORFEITED`);
  }

  console.log("\n" + "─".repeat(100));
}

// --- Main ---

async function main(): Promise<void> {
  console.log("=== Basketball-Bund offenespiele/search API Test ===\n");

  await login();

  const data = await searchOffeneSpiele();

  if (dumpRaw) {
    console.log("\n--- Raw JSON Response ---\n");
    console.log(JSON.stringify(data, null, 2));
    console.log();
  }

  displayResults(data as { total: number; results: OffeneSpielResult[] });

  console.log("\n✅ API call successful — endpoint works with current credentials.");
}

main().catch((err) => {
  console.error("\n❌ Failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
