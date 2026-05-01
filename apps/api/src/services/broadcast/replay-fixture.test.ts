import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const dbHolder = vi.hoisted(() => ({ ref: null as unknown }));
const mocks = vi.hoisted(() => ({
  publishSnapshot: vi.fn(),
  publishBroadcast: vi.fn(),
}));

vi.mock("../../config/database", () => ({
  db: new Proxy(
    {},
    {
      get: (_t, prop) =>
        (dbHolder.ref as Record<string | symbol, unknown>)[prop],
    },
  ),
}));

vi.mock("../scoreboard/pubsub", async () => {
  const actual = await vi.importActual<
    typeof import("../scoreboard/pubsub")
  >("../scoreboard/pubsub");
  return {
    ...actual,
    publishSnapshot: (...a: unknown[]) => mocks.publishSnapshot(...a),
    publishBroadcast: (...a: unknown[]) => mocks.publishBroadcast(...a),
  };
});

import {
  setupTestDb,
  resetTestDb,
  closeTestDb,
} from "../../test/setup-test-db";
import type { TestDbContext } from "../../test/setup-test-db";
import {
  broadcastConfigs,
  leagues,
  matches,
  teams,
} from "@dragons/db/schema";
import { processIngest } from "../scoreboard/ingest";

let ctx: TestDbContext;
beforeAll(async () => {
  ctx = await setupTestDb();
  dbHolder.ref = ctx.db;
});
beforeEach(async () => {
  await resetTestDb(ctx);
  mocks.publishSnapshot.mockReset();
  mocks.publishBroadcast.mockReset();
  mocks.publishSnapshot.mockResolvedValue(undefined);
  mocks.publishBroadcast.mockResolvedValue(undefined);
});
afterAll(async () => {
  await closeTestDb(ctx);
});

const FIXTURE = resolve(
  import.meta.dirname,
  "../scoreboard/__fixtures__/stramatel-sample.bin",
);

function findFrames(buf: Buffer): Buffer[] {
  const out: Buffer[] = [];
  const start = Buffer.from([0xf8, 0x33]);
  let cursor = 0;
  while (cursor < buf.length) {
    const s = buf.indexOf(start, cursor);
    if (s === -1) break;
    const e = buf.indexOf(0x0d, s + 2);
    if (e === -1) break;
    out.push(buf.subarray(s, e + 1));
    cursor = e + 1;
  }
  return out;
}

async function seed(): Promise<void> {
  await ctx.db.insert(leagues).values({
    id: 100,
    apiLigaId: 100,
    ligaNr: 1,
    name: "Liga",
    seasonId: 2026,
    seasonName: "2025/26",
  });
  await ctx.db.insert(teams).values([
    {
      apiTeamPermanentId: 1,
      seasonTeamId: 1,
      teamCompetitionId: 1,
      name: "Dragons",
      nameShort: "Dragons",
      clubId: 42,
      isOwnClub: true,
    },
    {
      apiTeamPermanentId: 2,
      seasonTeamId: 2,
      teamCompetitionId: 2,
      name: "Visitors",
      nameShort: "Visitors",
      clubId: 99,
      isOwnClub: false,
    },
  ]);
  const [m] = await ctx.db
    .insert(matches)
    .values({
      apiMatchId: 1,
      matchNo: 1,
      matchDay: 1,
      kickoffDate: "2026-05-02",
      kickoffTime: "19:30:00",
      leagueId: 100,
      homeTeamApiId: 1,
      guestTeamApiId: 2,
    })
    .returning({ id: matches.id });
  await ctx.db.insert(broadcastConfigs).values({
    deviceId: "d1",
    matchId: m!.id,
    isLive: true,
  });
}

describe("ingest → broadcast pipeline (fixture replay)", () => {
  it("replays fixture frames and publishes a phase=live event", async () => {
    await seed();
    const buf = readFileSync(FIXTURE);
    const frames = findFrames(buf);
    expect(frames.length).toBeGreaterThan(0);

    // The fixture's first live (period=1) frames begin around index 1810.
    // Replay a window that straddles that transition in chunks of 10
    // (mimics the wire chunking).
    const WINDOW_START = 1800;
    const WINDOW_END = 1830;
    for (
      let i = WINDOW_START;
      i < Math.min(WINDOW_END, frames.length);
      i += 10
    ) {
      const chunk = Buffer.concat(frames.slice(i, i + 10));
      await processIngest({ deviceId: "d1", hex: chunk.toString("hex") });
    }

    expect(mocks.publishBroadcast).toHaveBeenCalled();
    const calls = mocks.publishBroadcast.mock.calls as Array<
      [string, { phase: string; scoreboard: unknown }]
    >;
    const phases = calls.map((c) => c[1].phase);
    expect(phases).toContain("live");
    // The last published payload must carry a non-null scoreboard.
    const last = calls[calls.length - 1]![1];
    expect(last.scoreboard).not.toBeNull();
  });
});
