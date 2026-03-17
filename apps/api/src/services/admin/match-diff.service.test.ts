import { describe, expect, it } from "vitest";
import { computeDiffs, type DiffInput, OVERRIDABLE_FIELDS, LOCAL_ONLY_FIELDS } from "./match-diff.service";

function makeDiffInput(overrides: Partial<DiffInput> = {}): DiffInput {
  return {
    kickoffDate: "2026-03-20",
    kickoffTime: "19:30",
    venueNameOverride: null,
    venueName: null,
    isForfeited: null,
    isCancelled: null,
    anschreiber: null,
    zeitnehmer: null,
    shotclock: null,
    internalNotes: null,
    publicComment: null,
    ...overrides,
  };
}

describe("computeDiffs", () => {
  describe("no diffs", () => {
    it("returns empty array when no overrides and no operational fields set", () => {
      const row = makeDiffInput();
      const result = computeDiffs(row, []);
      expect(result).toEqual([]);
    });

    it("returns empty array when overriddenFields is empty and all operational fields are null", () => {
      const row = makeDiffInput({ venueName: "Some Hall" });
      const result = computeDiffs(row, []);
      expect(result).toEqual([]);
    });
  });

  describe("override diffs - kickoffDate", () => {
    it("returns diverged diff when kickoffDate is overridden and differs from remote", () => {
      const row = makeDiffInput({ kickoffDate: "2026-03-21" });
      const remote = { kickoffDate: "2026-03-20" };
      const result = computeDiffs(row, ["kickoffDate"], remote);

      expect(result).toContainEqual({
        field: "kickoffDate",
        label: "Date",
        remoteValue: "2026-03-20",
        localValue: "2026-03-21",
        status: "diverged",
      });
    });

    it("returns synced diff when kickoffDate is overridden and matches remote", () => {
      const row = makeDiffInput({ kickoffDate: "2026-03-20" });
      const remote = { kickoffDate: "2026-03-20" };
      const result = computeDiffs(row, ["kickoffDate"], remote);

      expect(result).toContainEqual({
        field: "kickoffDate",
        label: "Date",
        remoteValue: "2026-03-20",
        localValue: "2026-03-20",
        status: "synced",
      });
    });
  });

  describe("override diffs - kickoffTime", () => {
    it("returns synced diff when kickoffTime is overridden and matches remote", () => {
      const row = makeDiffInput({ kickoffTime: "19:30" });
      const remote = { kickoffTime: "19:30" };
      const result = computeDiffs(row, ["kickoffTime"], remote);

      expect(result).toContainEqual({
        field: "kickoffTime",
        label: "Time",
        remoteValue: "19:30",
        localValue: "19:30",
        status: "synced",
      });
    });

    it("returns diverged diff when kickoffTime differs from remote", () => {
      const row = makeDiffInput({ kickoffTime: "20:00" });
      const remote = { kickoffTime: "19:30" };
      const result = computeDiffs(row, ["kickoffTime"], remote);

      expect(result).toContainEqual({
        field: "kickoffTime",
        label: "Time",
        remoteValue: "19:30",
        localValue: "20:00",
        status: "diverged",
      });
    });
  });

  describe("override diffs - isForfeited", () => {
    it("returns diff when isForfeited is overridden with remote snapshot", () => {
      const row = makeDiffInput({ isForfeited: true });
      const remote = { isForfeited: false };
      const result = computeDiffs(row, ["isForfeited"], remote);

      expect(result).toContainEqual({
        field: "isForfeited",
        label: "Forfeited",
        remoteValue: "false",
        localValue: "true",
        status: "diverged",
      });
    });

    it("returns synced diff when isForfeited matches remote", () => {
      const row = makeDiffInput({ isForfeited: true });
      const remote = { isForfeited: true };
      const result = computeDiffs(row, ["isForfeited"], remote);

      expect(result).toContainEqual({
        field: "isForfeited",
        label: "Forfeited",
        remoteValue: "true",
        localValue: "true",
        status: "synced",
      });
    });
  });

  describe("override diffs - isCancelled", () => {
    it("falls back to row value when remote snapshot is null", () => {
      const row = makeDiffInput({ isCancelled: true });
      const result = computeDiffs(row, ["isCancelled"], null);

      expect(result).toContainEqual({
        field: "isCancelled",
        label: "Cancelled",
        remoteValue: "true",
        localValue: "true",
        status: "synced",
      });
    });

    it("falls back to row value when remote snapshot is undefined", () => {
      const row = makeDiffInput({ isCancelled: false });
      const result = computeDiffs(row, ["isCancelled"]);

      expect(result).toContainEqual({
        field: "isCancelled",
        label: "Cancelled",
        remoteValue: "false",
        localValue: "false",
        status: "synced",
      });
    });

    it("uses remote snapshot value when available", () => {
      const row = makeDiffInput({ isCancelled: true });
      const remote = { isCancelled: false };
      const result = computeDiffs(row, ["isCancelled"], remote);

      expect(result).toContainEqual({
        field: "isCancelled",
        label: "Cancelled",
        remoteValue: "false",
        localValue: "true",
        status: "diverged",
      });
    });
  });

  describe("venue diffs", () => {
    it("shows venue diff when venueNameOverride is set even without being in overriddenFields", () => {
      const row = makeDiffInput({
        venueNameOverride: "Custom Venue",
        venueName: "Original Venue",
      });
      const result = computeDiffs(row, []);

      expect(result).toContainEqual({
        field: "venue",
        label: "Venue",
        remoteValue: "Original Venue",
        localValue: "Custom Venue",
        status: "diverged",
      });
    });

    it("skips venue diff when venueNameOverride is null and not in overriddenFields", () => {
      const row = makeDiffInput({
        venueNameOverride: null,
        venueName: "Original Venue",
      });
      const result = computeDiffs(row, []);

      const venueDiff = result.find((d) => d.field === "venue");
      expect(venueDiff).toBeUndefined();
    });

    it("shows venue diff when venueNameOverride is in overriddenFields", () => {
      const row = makeDiffInput({
        venueNameOverride: null,
        venueName: "Original Venue",
      });
      const result = computeDiffs(row, ["venueNameOverride"]);

      expect(result).toContainEqual({
        field: "venue",
        label: "Venue",
        remoteValue: "Original Venue",
        localValue: null,
        status: "diverged",
      });
    });

    it("shows synced status when venue names match", () => {
      const row = makeDiffInput({
        venueNameOverride: "Same Venue",
        venueName: "Same Venue",
      });
      const result = computeDiffs(row, []);

      expect(result).toContainEqual({
        field: "venue",
        label: "Venue",
        remoteValue: "Same Venue",
        localValue: "Same Venue",
        status: "synced",
      });
    });
  });

  describe("operational fields", () => {
    it("returns local-only diff for anschreiber when set", () => {
      const row = makeDiffInput({ anschreiber: "Max Mustermann" });
      const result = computeDiffs(row, []);

      expect(result).toContainEqual({
        field: "anschreiber",
        label: "Anschreiber",
        remoteValue: null,
        localValue: "Max Mustermann",
        status: "local-only",
      });
    });

    it("returns local-only diff for zeitnehmer when set", () => {
      const row = makeDiffInput({ zeitnehmer: "Erika Musterfrau" });
      const result = computeDiffs(row, []);

      expect(result).toContainEqual({
        field: "zeitnehmer",
        label: "Zeitnehmer",
        remoteValue: null,
        localValue: "Erika Musterfrau",
        status: "local-only",
      });
    });

    it("returns local-only diff for shotclock when set", () => {
      const row = makeDiffInput({ shotclock: "Person A" });
      const result = computeDiffs(row, []);

      expect(result).toContainEqual({
        field: "shotclock",
        label: "Shotclock",
        remoteValue: null,
        localValue: "Person A",
        status: "local-only",
      });
    });

    it("returns local-only diff for internalNotes when set", () => {
      const row = makeDiffInput({ internalNotes: "Check venue booking" });
      const result = computeDiffs(row, []);

      expect(result).toContainEqual({
        field: "internalNotes",
        label: "Internal Notes",
        remoteValue: null,
        localValue: "Check venue booking",
        status: "local-only",
      });
    });

    it("returns local-only diff for publicComment when set", () => {
      const row = makeDiffInput({ publicComment: "Game rescheduled" });
      const result = computeDiffs(row, []);

      expect(result).toContainEqual({
        field: "publicComment",
        label: "Public Comment",
        remoteValue: null,
        localValue: "Game rescheduled",
        status: "local-only",
      });
    });

    it("skips operational fields with null values", () => {
      const row = makeDiffInput({
        anschreiber: null,
        zeitnehmer: null,
        shotclock: null,
        internalNotes: null,
        publicComment: null,
      });
      const result = computeDiffs(row, []);

      const opFields = result.filter((d) => d.status === "local-only");
      expect(opFields).toHaveLength(0);
    });
  });

  describe("mixed diffs", () => {
    it("returns both override diffs and operational diffs together", () => {
      const row = makeDiffInput({
        kickoffDate: "2026-04-01",
        anschreiber: "Helper A",
        zeitnehmer: "Helper B",
      });
      const remote = { kickoffDate: "2026-03-20" };
      const result = computeDiffs(row, ["kickoffDate"], remote);

      expect(result).toHaveLength(3);
      expect(result.find((d) => d.field === "kickoffDate")?.status).toBe("diverged");
      expect(result.find((d) => d.field === "anschreiber")?.status).toBe("local-only");
      expect(result.find((d) => d.field === "zeitnehmer")?.status).toBe("local-only");
    });
  });

  describe("remote snapshot null handling", () => {
    it("uses row values as fallback when remote snapshot is null", () => {
      const row = makeDiffInput({ kickoffDate: "2026-03-20", kickoffTime: "19:30" });
      const result = computeDiffs(row, ["kickoffDate", "kickoffTime"], null);

      const dateDiff = result.find((d) => d.field === "kickoffDate");
      expect(dateDiff?.remoteValue).toBe("2026-03-20");
      expect(dateDiff?.localValue).toBe("2026-03-20");
      expect(dateDiff?.status).toBe("synced");
    });

    it("uses row values as fallback when remote snapshot field is missing", () => {
      const row = makeDiffInput({ kickoffDate: "2026-03-20" });
      const remote = {}; // no kickoffDate in snapshot
      const result = computeDiffs(row, ["kickoffDate"], remote);

      // ?? fallback: remoteSnapshot?.kickoffDate as string ?? row.kickoffDate
      const dateDiff = result.find((d) => d.field === "kickoffDate");
      expect(dateDiff?.remoteValue).toBe("2026-03-20");
      expect(dateDiff?.status).toBe("synced");
    });
  });

  describe("null effective value handling", () => {
    it("converts null effective value to null localValue", () => {
      const row = makeDiffInput({ isForfeited: null });
      const remote = { isForfeited: true };
      const result = computeDiffs(row, ["isForfeited"], remote);

      const diff = result.find((d) => d.field === "isForfeited");
      expect(diff?.localValue).toBeNull();
      expect(diff?.remoteValue).toBe("true");
      expect(diff?.status).toBe("diverged");
    });

    it("converts null remote value to null remoteValue", () => {
      const row = makeDiffInput({
        venueNameOverride: "Custom",
        venueName: null,
      });
      const result = computeDiffs(row, []);

      const diff = result.find((d) => d.field === "venue");
      expect(diff?.remoteValue).toBeNull();
      expect(diff?.localValue).toBe("Custom");
      expect(diff?.status).toBe("diverged");
    });
  });

  describe("exported constants", () => {
    it("OVERRIDABLE_FIELDS contains expected fields", () => {
      expect(OVERRIDABLE_FIELDS).toContain("kickoffDate");
      expect(OVERRIDABLE_FIELDS).toContain("kickoffTime");
      expect(OVERRIDABLE_FIELDS).toContain("homeScore");
      expect(OVERRIDABLE_FIELDS).toContain("guestScore");
      expect(OVERRIDABLE_FIELDS).toContain("isForfeited");
      expect(OVERRIDABLE_FIELDS).toContain("isCancelled");
      expect(OVERRIDABLE_FIELDS).toHaveLength(20);
    });

    it("LOCAL_ONLY_FIELDS contains expected fields", () => {
      expect(LOCAL_ONLY_FIELDS).toContain("venueId");
      expect(LOCAL_ONLY_FIELDS).toContain("venueNameOverride");
      expect(LOCAL_ONLY_FIELDS).toContain("anschreiber");
      expect(LOCAL_ONLY_FIELDS).toContain("zeitnehmer");
      expect(LOCAL_ONLY_FIELDS).toContain("shotclock");
      expect(LOCAL_ONLY_FIELDS).toContain("internalNotes");
      expect(LOCAL_ONLY_FIELDS).toContain("publicComment");
      expect(LOCAL_ONLY_FIELDS).toHaveLength(7);
    });
  });
});
