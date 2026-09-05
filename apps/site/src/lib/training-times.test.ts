import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { formatTimeRange, trainingTimeRows, type TrainingTimeInput } from "./training-times";

function entry(overrides: Partial<TrainingTimeInput> = {}): TrainingTimeInput {
  return {
    day: "Montag",
    startTime: "17:00",
    endTime: "18:30",
    gym: "Sporthalle Bismarckschule",
    gymMapsUrl: "https://maps.app.goo.gl/abc",
    info: "Halle 2, Eingang Hinterhof",
    ...overrides,
  };
}

describe("trainingTimeRows", () => {
  it("returns no rows for a team without training times", () => {
    expect(trainingTimeRows(null)).toEqual([]);
    expect(trainingTimeRows(undefined)).toEqual([]);
    expect(trainingTimeRows([])).toEqual([]);
  });

  it("shapes a complete row: time range, gym link and info line", () => {
    expect(trainingTimeRows([entry()])).toEqual([
      {
        day: "Montag",
        time: "17:00 – 18:30",
        gym: "Sporthalle Bismarckschule",
        mapsHref: "https://maps.app.goo.gl/abc",
        info: "Halle 2, Eingang Hinterhof",
      },
    ]);
  });

  it("shows only the start time when the row has no end time", () => {
    expect(trainingTimeRows([entry({ endTime: null })])[0]?.time).toBe("17:00");
    expect(trainingTimeRows([entry({ endTime: undefined })])[0]?.time).toBe("17:00");
  });

  it("renders the gym as plain text when there is no maps URL", () => {
    expect(trainingTimeRows([entry({ gymMapsUrl: null })])[0]?.mapsHref).toBeNull();
    expect(trainingTimeRows([entry({ gymMapsUrl: undefined })])[0]?.mapsHref).toBeNull();
  });

  it("drops the info line when the row has none", () => {
    expect(trainingTimeRows([entry({ info: null })])[0]?.info).toBeNull();
    expect(trainingTimeRows([entry({ info: undefined })])[0]?.info).toBeNull();
  });

  // Payload stores an emptied text field as "" (or a stray space), not null.
  it("treats whitespace-only optional fields as absent", () => {
    const [row] = trainingTimeRows([entry({ endTime: "  ", gymMapsUrl: "", info: " \t" })]);
    expect(row).toEqual({
      day: "Montag",
      time: "17:00",
      gym: "Sporthalle Bismarckschule",
      mapsHref: null,
      info: null,
    });
  });

  it("trims the required fields", () => {
    const [row] = trainingTimeRows([
      entry({ day: " Dienstag ", startTime: " 18:00 ", endTime: " 19:30 ", gym: " Halle A " }),
    ]);
    expect(row).toMatchObject({ day: "Dienstag", time: "18:00 – 19:30", gym: "Halle A" });
  });

  it("keeps the editor's order", () => {
    const rows = trainingTimeRows([
      entry({ day: "Freitag" }),
      entry({ day: "Montag" }),
      entry({ day: "Mittwoch" }),
    ]);
    expect(rows.map((row) => row.day)).toEqual(["Freitag", "Montag", "Mittwoch"]);
  });
});

describe("formatTimeRange", () => {
  it("joins start and end with a spaced en dash", () => {
    expect(formatTimeRange("17:00", "18:30")).toBe("17:00 – 18:30");
  });

  it("returns the start alone without an end", () => {
    expect(formatTimeRange("17:00", null)).toBe("17:00");
    expect(formatTimeRange("17:00", "")).toBe("17:00");
  });
});

// The .astro renderer is compiled by Astro, not importable here; assert its
// contract from source, the way document-structure.test.ts reads the pages.
describe("TrainingTimes.astro", () => {
  const COMPONENT = readFileSync(
    fileURLToPath(new URL("../components/teams/TrainingTimes.astro", import.meta.url)),
    "utf8",
  );
  const PAGE = readFileSync(
    fileURLToPath(new URL("../pages/teams/[slug].astro", import.meta.url)),
    "utf8",
  );

  it("renders the rows this helper shapes, under the shared heading string", () => {
    expect(COMPONENT).toContain("trainingTimeRows(");
    expect(COMPONENT).toContain("strings.teams.trainingTimesHeading");
  });

  it("opens the gym maps link in a new tab without a referrer", () => {
    expect(COMPONENT).toMatch(/href=\{row\.mapsHref\}[\s\S]*?target="_blank"[\s\S]*?rel="noopener noreferrer"/);
  });

  it("is mounted on the team page between the coach band and the game band", () => {
    const trainer = PAGE.indexOf("<TeamTrainer");
    const training = PAGE.indexOf("<TrainingTimes");
    const games = PAGE.indexOf("<NextPrevGame");
    expect(trainer).toBeGreaterThan(-1);
    expect(training).toBeGreaterThan(trainer);
    expect(games).toBeGreaterThan(training);
  });
});
