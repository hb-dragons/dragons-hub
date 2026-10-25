import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "@/i18n/en.json";
import { lookup } from "../../../test/i18n-bundles";
import type { Translate } from "@/lib/ui/match-a11y";

vi.mock("@/lib/i18n", () => ({ i18n: { locale: "en", t: () => "" } }));

import { adminSlotA11yActions, refereeGameA11yLabel } from "./game-card-a11y";

const t: Translate = (key, options = {}) => {
  const template = lookup(en, key);
  if (typeof template !== "string") throw new Error(`missing key ${key}`);
  return template.replace(/%\{(\w+)\}/g, (_, name: string) => String(options[name]));
};

type Game = Parameters<typeof refereeGameA11yLabel>[0];

function game(overrides: Partial<Game> = {}): Game {
  return {
    homeTeamName: "TV Dragons",
    guestTeamName: "Rhein Stars",
    homeTeamCustomName: "Herren 1",
    guestTeamCustomName: null,
    kickoffDate: "2026-04-25",
    kickoffTime: "18:30:00",
    isCancelled: false,
    isForfeited: false,
    leagueShort: "OL",
    venueName: "Sporthalle Nord",
    sr1Name: "Max Muster",
    sr2Name: null,
    sr1Status: "assigned",
    sr2Status: "open",
    ...overrides,
  };
}

beforeEach(() => {
  vi.stubEnv("TZ", "America/Los_Angeles");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("refereeGameA11yLabel", () => {
  it("reads fixture, league, hall and both slots in order", () => {
    expect(refereeGameA11yLabel(game(), t, "en-US")).toBe(
      "Herren 1 vs Rhein Stars, Saturday, 25.04.2026 at 18:30, OL, Sporthalle Nord, R1: Max Muster, R2: Not yet assigned",
    );
  });

  it("skips the league and hall when the row has none", () => {
    expect(refereeGameA11yLabel(game({ leagueShort: null, venueName: null }), t, "en-US")).toBe(
      "Herren 1 vs Rhein Stars, Saturday, 25.04.2026 at 18:30, R1: Max Muster, R2: Not yet assigned",
    );
  });
});

describe("adminSlotA11yActions", () => {
  it("offers remove on an assigned slot and assign on an open one", () => {
    expect(adminSlotA11yActions(game(), t)).toEqual([
      {
        name: "unassign-1",
        label: "Remove Max Muster from R1",
        kind: "unassign",
        slotNumber: 1,
        refereeName: "Max Muster",
      },
      { name: "assign-2", label: "Assign SR2", kind: "assign", slotNumber: 2 },
    ]);
  });

  it("offers nothing for an offered slot or an assigned one without a name", () => {
    expect(
      adminSlotA11yActions(
        game({ sr1Status: "offered", sr2Status: "assigned", sr2Name: null }),
        t,
      ),
    ).toEqual([]);
  });

  it("names the second slot's actions after slot 2", () => {
    const actions = adminSlotA11yActions(
      game({ sr1Status: "open", sr1Name: null, sr2Status: "assigned", sr2Name: "Eva Pfiff" }),
      t,
    );
    expect(actions.map((a) => a.name)).toEqual(["assign-1", "unassign-2"]);
    expect(actions[1]?.label).toBe("Remove Eva Pfiff from R2");
  });
});
