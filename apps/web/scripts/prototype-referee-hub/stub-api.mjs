// PROTOTYPE — throwaway stub API for the referee hub layout prototype.
// In-memory only; restart to reset. Serves just the endpoints /admin/referees
// touches, with fixtures shaped like the production data. Never deploy.
import http from "node:http";

const PORT = Number(process.env.STUB_PORT ?? 3091);
const ORIGIN = "http://localhost:3000";

// --- fixtures -------------------------------------------------------------

const DAY = 86_400_000;
function berlinToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(new Date());
}
function addDays(iso, n) {
  return new Date(Date.parse(iso + "T12:00:00Z") + n * DAY).toISOString().slice(0, 10);
}
// Next Saturday on or after today.
function nextSaturday(iso) {
  const dow = new Date(iso + "T12:00:00Z").getUTCDay();
  return addDays(iso, (6 - dow + 7) % 7);
}

const LEAGUES = [
  { apiLigaId: 48101, name: "Region Kreisliga U10 mixed", short: "RKu10mw" },
  { apiLigaId: 48102, name: "Region Kreisliga U12 mixed", short: "RKu12mo" },
  { apiLigaId: 48103, name: "Region Kreisliga U14 männlich", short: "RKu14mm" },
  { apiLigaId: 48104, name: "Region Kreisliga U16 mixed", short: "RKu16mo" },
  { apiLigaId: 48105, name: "Region Kreisliga Herren", short: "RKHo" },
  { apiLigaId: 48106, name: "Oberliga Herren", short: "OLH" },
];
const OPPONENTS = [
  "TK Hannover 2 w", "Linden Dudes 2", "TuS Eicklingen Lumberjacks", "TuS Bothfeld",
  "BG Godshorn-Langenhagen", "MTV Mellendorf 1", "SC Langenhagen", "TSV Burgdorf",
  "Hannover United", "SV Arminia Hannover", "BC Hannover 3", "TSG Ahlten",
];
const OWN = ["Hanover Dragons", "Hanover Basketball Dragons 2", "Hanover Dragons U16", "Hanover Dragons Herren"];
const REF_NAMES = [
  ["Lena", "Bauer"], ["Jonas", "Krüger"], ["Mia", "Schulz"], ["Felix", "Wagner"], ["Emma", "Hoffmann"],
  ["Paul", "Schäfer"], ["Lea", "Koch"], ["Ben", "Richter"], ["Hannah", "Klein"], ["Luca", "Wolf"],
  ["Sophie", "Neumann"], ["Noah", "Schwarz"], ["Marie", "Zimmermann"], ["Elias", "Braun"], ["Clara", "Hartmann"],
  ["Finn", "Lange"], ["Ida", "Werner"], ["Leon", "Krause"], ["Frieda", "Meier"], ["Anton", "Lehmann"],
  ["Greta", "Schmid"], ["Moritz", "Schulze"], ["Nele", "Maier"], ["Theo", "Köhler"], ["Lina", "Herrmann"],
];

// Deterministic pseudo-random so every restart shows the same data.
let seed = 7;
function rand() {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
}
const pick = (arr) => arr[Math.floor(rand() * arr.length)];

const referees = REF_NAMES.map(([vorname, nachName], i) => {
  const total = Math.floor(rand() * 14);
  return {
    srId: 70000 + i,
    vorname,
    nachName,
    email: `${vorname.toLowerCase()}@example.test`,
    lizenznr: 500000 + i,
    strasse: "Musterstraße 1",
    plz: "30159",
    ort: pick(["Hannover", "Langenhagen", "Garbsen", "Laatzen"]),
    distanceKm: (2 + rand() * 25).toFixed(1),
    qmaxSr1: i % 5 === 4 ? null : "E-Lizenz",
    qmaxSr2: "E-Lizenz",
    warning: [],
    meta: {
      schiedsrichterId: 70000 + i, lizenzNr: 500000 + i,
      heimTotal: Math.floor(total / 2), gastTotal: total - Math.floor(total / 2), total,
      va: 0, eh: 0, qmaxSr1: null, qmaxSr2: null,
      tnaCount: 0, sperrvereinCount: 0, sperrzeitenCount: 0, qualiSr1: 1, qualiSr2: 1,
    },
    qualiSr1: i % 5 !== 4,
    qualiSr2: true,
    qualiSr3: false, qualiCoa: false, qualiKom: false,
    srModusMismatchSr1: false,
    srModusMismatchSr2: i === 7,
    ansetzungAmTag: false,
    blocktermin: i === 11,
    zeitraumBlockiert: i === 15 ? "Urlaub bis Monatsende" : null,
    srGruppen: [],
  };
});

const today = berlinToday();
const firstSat = nextSaturday(today);
const games = [];
let n = 0;
// Ten weekends, a handful of games each; a couple of midweek ones too.
for (let week = 0; week < 10; week++) {
  const perWeekend = 3 + Math.floor(rand() * 4);
  for (let k = 0; k < perWeekend; k++) {
    const day = addDays(firstSat, week * 7 + (rand() < 0.45 ? 1 : 0));
    const time = pick(["10:00", "11:00", "12:30", "14:00", "15:00", "16:30", "18:00"]);
    const league = pick(LEAGUES);
    const home = rand() < 0.75;
    const own = league.short === "RKHo" || league.short === "OLH" ? OWN[3] : pick(OWN.slice(0, 3));
    const opp = pick(OPPONENTS);
    // Earlier weeks are more staffed; later ones mostly still open.
    const fillChance = Math.max(0.05, 0.55 - week * 0.07);
    const slot = () => {
      const r = rand();
      if (r < fillChance) return "assigned";
      if (r < fillChance + 0.12) return "offered";
      return "open";
    };
    const sr1Status = slot();
    const sr2Status = slot();
    const ref1 = sr1Status === "assigned" ? pick(referees) : null;
    const ref2 = sr2Status === "assigned" ? pick(referees.filter((r) => r !== ref1)) : null;
    n++;
    games.push({
      id: n,
      apiMatchId: 2_100_000 + n,
      matchId: n,
      matchNo: 1000 + n,
      kickoffDate: day,
      kickoffTime: time + ":00",
      homeTeamName: home ? own : opp,
      guestTeamName: home ? opp : own,
      leagueName: league.name,
      leagueShort: league.short,
      leagueApiId: league.apiLigaId,
      venueName: home ? "Sporthalle Dragons-Arena" : `Halle ${opp.split(" ")[0]}`,
      venueCity: home ? "Hannover" : pick(["Hannover", "Langenhagen", "Burgdorf", "Eicklingen"]),
      homeTeamId: null, homeClubId: null, guestClubId: null,
      homeTeamCustomName: null, guestTeamCustomName: null,
      // Home games: both slots are ours. Away: sometimes one.
      sr1OurClub: true,
      sr2OurClub: home ? true : rand() < 0.4,
      sr1Name: ref1 ? `${ref1.vorname} ${ref1.nachName}` : null,
      sr2Name: ref2 ? `${ref2.vorname} ${ref2.nachName}` : null,
      sr1RefereeApiId: ref1?.srId ?? null,
      sr2RefereeApiId: ref2?.srId ?? null,
      sr1Status,
      sr2Status,
      isCancelled: false,
      isForfeited: false,
      isTrackedLeague: true,
      isHomeGame: home,
      isGuestGame: !home,
      lastSyncedAt: new Date().toISOString(),
      mySlot: null,
      claimableSlots: [],
    });
  }
}
games.sort((a, b) => (a.kickoffDate + a.kickoffTime).localeCompare(b.kickoffDate + b.kickoffTime));

// --- filtering (mirrors getVisibleRefereeGames admin mode) ------------------

const OWN_SLOT_STATUSES = { open: ["open"], offered: ["open", "offered"], any: ["open", "offered", "assigned"] };
function ownSlotMatches(g, slotStatus) {
  const ok = OWN_SLOT_STATUSES[slotStatus];
  return (g.sr1OurClub && ok.includes(g.sr1Status)) || (g.sr2OurClub && ok.includes(g.sr2Status));
}

function listGames(q) {
  let rows = games.filter((g) => !g.isCancelled && !g.isForfeited);
  const assigned = q.get("assignedRefereeApiId");
  const slotStatus = q.get("slotStatus");
  if (assigned) {
    rows = rows.filter((g) => String(g.sr1RefereeApiId) === assigned || String(g.sr2RefereeApiId) === assigned);
    if (slotStatus) rows = rows.filter((g) => ownSlotMatches(g, slotStatus));
  } else {
    rows = rows.filter((g) => ownSlotMatches(g, slotStatus ?? "open"));
  }
  const league = q.get("league");
  if (league) {
    const ids = league.split(",").map(Number);
    rows = rows.filter((g) => ids.includes(g.leagueApiId));
  }
  const gameType = q.get("gameType");
  if (gameType === "home") rows = rows.filter((g) => g.isHomeGame);
  if (gameType === "away") rows = rows.filter((g) => g.isGuestGame);
  const from = q.get("dateFrom");
  const to = q.get("dateTo");
  if (from) rows = rows.filter((g) => g.kickoffDate >= from);
  if (to) rows = rows.filter((g) => g.kickoffDate <= to);
  const search = q.get("search");
  if (search) {
    for (const word of search.toLowerCase().split(/\s+/).filter(Boolean)) {
      rows = rows.filter((g) =>
        [g.homeTeamName, g.guestTeamName, g.leagueName].some((s) => s.toLowerCase().includes(word)),
      );
    }
  }
  const limit = Number(q.get("limit") ?? 100);
  const offset = Number(q.get("offset") ?? 0);
  const items = rows.slice(offset, offset + limit);
  return { items, total: rows.length, limit, offset, hasMore: offset + items.length < rows.length };
}

function gameLeagues() {
  const seen = new Map();
  for (const g of games) if (ownSlotMatches(g, "any")) seen.set(g.leagueApiId, g);
  const leagues = [...seen.values()]
    .map((g) => ({ apiLigaId: g.leagueApiId, name: g.leagueName, short: g.leagueShort }))
    .sort((a, b) => a.name.localeCompare(b.name, "de"));
  return { leagues };
}

function candidates(q) {
  const search = (q.get("search") ?? "").toLowerCase();
  const pageFrom = Number(q.get("pageFrom") ?? 0);
  const pageSize = Number(q.get("pageSize") ?? 15);
  const rows = referees
    .filter((r) => `${r.vorname} ${r.nachName}`.toLowerCase().includes(search))
    .sort((a, b) => Number(a.distanceKm) - Number(b.distanceKm));
  return { total: rows.length, results: rows.slice(pageFrom * pageSize, (pageFrom + 1) * pageSize) };
}

// --- server ---------------------------------------------------------------

const user = {
  id: "proto-admin", name: "Prototype Admin", email: "admin@example.test", role: "admin",
  refereeId: null, personId: null, emailVerified: true,
  createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
};
const session = { id: "proto", token: "proto", userId: user.id, expiresAt: new Date(Date.now() + 30 * DAY).toISOString() };

function readBody(req) {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => resolve(raw ? JSON.parse(raw) : {}));
  });
}

http
  .createServer(async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", req.headers.origin ?? ORIGIN);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Headers", "content-type");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
    res.setHeader("Content-Type", "application/json");
    if (req.method === "OPTIONS") return res.end();

    const url = new URL(req.url, `http://localhost:${PORT}`);
    const p = url.pathname;
    const send = (body, status = 200) => {
      res.statusCode = status;
      res.end(JSON.stringify(body));
    };
    const authed = (req.headers.cookie ?? "").includes("dragons.session_token=");

    if (p === "/api/auth/sign-in/email") {
      res.setHeader("Set-Cookie", "dragons.session_token=proto; Path=/; HttpOnly; SameSite=Lax");
      return send({ redirect: false, token: "proto", user });
    }
    if (p === "/api/auth/get-session") return res.end(authed ? JSON.stringify({ user, session }) : "null");
    if (p === "/api/auth/sign-out") {
      res.setHeader("Set-Cookie", "dragons.session_token=; Path=/; Max-Age=0");
      return send({ success: true });
    }
    if (p.startsWith("/api/auth/")) return send({});

    if (p === "/referee/games") return send(listGames(url.searchParams));
    let m = p.match(/^\/referee\/games\/by-api-match\/(\d+)$/);
    if (m) {
      const g = games.find((x) => x.apiMatchId === Number(m[1]));
      return g ? send(g) : send({ error: "Not found", code: "NOT_FOUND" }, 404);
    }
    if (p === "/admin/referees/game-leagues") return send(gameLeagues());
    if (p === "/admin/referees/counts") return send({ own: referees.length, all: referees.length + 40 });
    if (p === "/admin/referees") return send({ items: [], total: 0, limit: 50, offset: 0, hasMore: false });

    m = p.match(/^\/admin\/referee\/games\/(\d+)\/candidates$/);
    if (m) return send(candidates(url.searchParams));

    m = p.match(/^\/admin\/referee\/games\/(\d+)\/assign$/);
    if (m && req.method === "POST") {
      const { slotNumber, refereeApiId } = await readBody(req);
      const g = games.find((x) => x.apiMatchId === Number(m[1]));
      const r = referees.find((x) => x.srId === refereeApiId);
      if (!g || !r) return send({ error: "Not found", code: "NOT_FOUND" }, 404);
      const name = `${r.vorname} ${r.nachName}`;
      g[`sr${slotNumber}Status`] = "assigned";
      g[`sr${slotNumber}Name`] = name;
      g[`sr${slotNumber}RefereeApiId`] = r.srId;
      r.meta.total += 1;
      return send({ success: true, slot: `sr${slotNumber}`, status: "assigned", refereeName: name });
    }
    m = p.match(/^\/admin\/referee\/games\/(\d+)\/assignment\/([12])$/);
    if (m && req.method === "DELETE") {
      const g = games.find((x) => x.apiMatchId === Number(m[1]));
      if (!g) return send({ error: "Not found", code: "NOT_FOUND" }, 404);
      g[`sr${m[2]}Status`] = "open";
      g[`sr${m[2]}Name`] = null;
      g[`sr${m[2]}RefereeApiId`] = null;
      return send({ success: true, slot: `sr${m[2]}`, status: "open" });
    }

    // Anything else the admin shell asks for: an empty answer, not a crash.
    send({});
  })
  .listen(PORT, () => console.log(`[prototype] stub API on http://localhost:${PORT} — ${games.length} games`));
