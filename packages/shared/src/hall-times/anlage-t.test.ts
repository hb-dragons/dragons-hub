import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseAnlageT } from "./anlage-t";
import goetheschule from "./fixtures/anlage-t-goetheschule.json";
import fes from "./fixtures/anlage-t-fes.json";

// Kiritimati (UTC+14) on purpose: a parsed day must be the sheet's day, not
// one shifted by the runtime zone.
beforeEach(() => {
  vi.stubEnv("TZ", "Pacific/Kiritimati");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function rowFor(result: ReturnType<typeof parseAnlageT>, date: string) {
  return result.rows.find((r) => r.date === date);
}

describe("parseAnlageT", () => {
  describe("Goetheschule sheet (both column blocks, notes, stars)", () => {
    const result = parseAnlageT(goetheschule);

    it("reads the hall name and the update date from the header", () => {
      expect(result.hallName).toBe("Gymnasium Goetheschule");
      expect(result.updatedOn).toBe("2026-09-14");
    });

    it("turns a filled von/bis pair into an open day", () => {
      expect(rowFor(result, "2026-09-06")).toEqual({
        date: "2026-09-06",
        kind: "open",
        startTime: "10:00",
        endTime: "20:00",
        note: null,
      });
    });

    it("reads the right-hand block too", () => {
      expect(rowFor(result, "2027-01-31")).toMatchObject({
        kind: "open",
        startTime: "11:30",
        endTime: "18:00",
      });
      expect(rowFor(result, "2027-03-20")).toMatchObject({
        kind: "open",
        startTime: "17:00",
        endTime: "21:00",
      });
    });

    it("produces no row for a dash day", () => {
      expect(rowFor(result, "2026-08-15")).toBeUndefined();
    });

    it("treats blank rows next to a note run as part of that closure", () => {
      const joined = "Sommerferien 02.07.-12.08.";
      expect(rowFor(result, "2026-07-25")).toMatchObject({ kind: "closed", note: joined });
      expect(rowFor(result, "2026-08-09")).toMatchObject({ kind: "closed", note: joined });
      expect(rowFor(result, "2026-12-26")?.note).toBe("Weihnachtsferien 23.12.-09.01. keine Vermietung");
    });

    it("turns a note without times into a closed day, stars stripped", () => {
      expect(rowFor(result, "2026-10-03")).toEqual({
        date: "2026-10-03",
        kind: "closed",
        startTime: null,
        endTime: null,
        note: "Tag der Dt. Einheit",
      });
    });

    it("joins a note that runs over consecutive rows onto each of them", () => {
      const joined = "Sommerferien 02.07.-12.08.";
      expect(rowFor(result, "2026-08-01")?.note).toBe(joined);
      expect(rowFor(result, "2026-08-02")?.note).toBe(joined);
      const xmas = "Weihnachtsferien 23.12.-09.01. keine Vermietung";
      expect(rowFor(result, "2026-12-27")?.note).toBe(xmas);
      expect(rowFor(result, "2027-01-03")?.note).toBe(xmas);
    });

    it("counts 27 open and 24 closed days, in date order, with no warnings", () => {
      expect(result.rows.filter((r) => r.kind === "open")).toHaveLength(27);
      expect(result.rows.filter((r) => r.kind === "closed")).toHaveLength(24);
      const dates = result.rows.map((r) => r.date);
      expect(dates).toEqual([...dates].sort());
      expect(result.warnings).toEqual([]);
    });
  });

  describe("cell shapes and bad rows", () => {
    const header = [
      [null, "Anlage T zum Mietantrag", null, null, null, null, null, null, null, "Datum dieser Aktualisierung:", new Date(2026, 8, 14)],
      [],
      [null, "Sporthalle:", null, null, "Testhalle"],
      [],
      [],
      [null, null, "Tag", "Datum", "von", "-", "bis", null, "Tag", "Datum", "von", "-", "bis"],
    ];

    it("accepts Date cells, numeric times and ISO or German date strings", () => {
      const result = parseAnlageT([
        ...header,
        [null, null, "Sa", new Date(2026, 8, 5), 1000, "-", 1430, null, "Sa", "2027-01-23", "09:00:00", "-", "12:00:00"],
        [null, null, "So", "06.09.2026", "10:00", "-", "20:00", null, "So", "1/24/27", null, "-", null],
      ]);
      expect(result.updatedOn).toBe("2026-09-14");
      expect(result.rows).toEqual([
        { date: "2026-09-05", kind: "open", startTime: "10:00", endTime: "14:30", note: null },
        { date: "2026-09-06", kind: "open", startTime: "10:00", endTime: "20:00", note: null },
        { date: "2027-01-23", kind: "open", startTime: "09:00", endTime: "12:00", note: null },
      ]);
    });

    it("warns and skips a row with only one end of the window, an unreadable date or an inverted window", () => {
      const result = parseAnlageT([
        ...header,
        [null, null, "Sa", "9/5/26", "10:00", "-", null],
        [null, null, "So", "nonsense", "10:00", "-", "12:00"],
        [null, null, "Sa", "9/12/26", "14:00", "-", "10:00"],
        [null, null, "So", "9/13/26", "10:00", "-", "12:00"],
      ]);
      expect(result.rows.map((r) => r.date)).toEqual(["2026-09-13"]);
      expect(result.warnings).toEqual([
        "2026-09-05: only one end of the time window is filled",
        "Row 8: unreadable date \"nonsense\"",
        "2026-09-12: end time is not after start time",
      ]);
    });

    it("produces no row for a blank day that touches no note", () => {
      const result = parseAnlageT([
        ...header,
        [null, null, "Sa", "9/5/26", null, null, null],
        [null, null, "So", "9/6/26", null, "-", null],
        [null, null, "Sa", "9/12/26", null, null, null],
        [null, null, "So", "9/13/26", null, "Ferien", null],
      ]);
      expect(result.rows).toEqual([
        { date: "2026-09-12", kind: "closed", startTime: null, endTime: null, note: "Ferien" },
        { date: "2026-09-13", kind: "closed", startTime: null, endTime: null, note: "Ferien" },
      ]);
    });

    it("throws when the sheet has no Tag/Datum header", () => {
      expect(() => parseAnlageT([["nothing"], ["here"]])).toThrow(/Tag/);
    });

    it("falls back to nulls when hall name and update date are missing", () => {
      const result = parseAnlageT([
        [null, null, "Tag", "Datum", "von", "-", "bis"],
        [null, null, "Sa", "9/5/26", "10:00", "-", "14:00"],
      ]);
      expect(result.hallName).toBeNull();
      expect(result.updatedOn).toBeNull();
      expect(result.rows).toHaveLength(1);
    });
  });

  describe("FES sheet", () => {
    const result = parseAnlageT(fes);

    it("reads its three open days", () => {
      expect(result.hallName).toBe("Friedrich-Ebert-Schule");
      expect(result.rows.filter((r) => r.kind === "open")).toEqual([
        { date: "2026-11-21", kind: "open", startTime: "15:00", endTime: "18:00", note: null },
        { date: "2027-01-10", kind: "open", startTime: "12:00", endTime: "18:00", note: null },
        { date: "2027-01-23", kind: "open", startTime: "10:00", endTime: "18:00", note: null },
      ]);
    });
  });
});
