import { describe, expect, it } from "vitest";
import { renderOverrideMessage } from "./override";
import { EVENT_TYPES } from "@dragons/shared";

describe("renderOverrideMessage", () => {
  describe(EVENT_TYPES.OVERRIDE_APPLIED, () => {
    const payload = {
      matchNo: 42,
      homeTeam: "Dragons",
      guestTeam: "Tigers",
      field: "venue",
      originalValue: "Alte Halle",
      overrideValue: "Neue Halle",
      appliedBy: "admin@club.de",
    };

    it("renders override applied in German", () => {
      const result = renderOverrideMessage(
        EVENT_TYPES.OVERRIDE_APPLIED,
        payload,
        "Dragons vs Tigers",
        "de",
      );
      expect(result).not.toBeNull();
      expect(result!.title).toContain("Override angewendet");
      expect(result!.body).toContain("Dragons vs Tigers");
      expect(result!.body).toContain("venue");
      expect(result!.body).toContain("Alte Halle");
      expect(result!.body).toContain("Neue Halle");
      expect(result!.body).toContain("admin@club.de");
    });

    it("renders override applied in English", () => {
      const result = renderOverrideMessage(
        EVENT_TYPES.OVERRIDE_APPLIED,
        payload,
        "Dragons vs Tigers",
        "en",
      );
      expect(result).not.toBeNull();
      expect(result!.title).toContain("Override applied");
      expect(result!.body).toContain("changed from");
      expect(result!.body).toContain("Alte Halle");
      expect(result!.body).toContain("Neue Halle");
      expect(result!.body).toContain("by admin@club.de");
    });

    it("handles missing payload fields gracefully", () => {
      const sparse = { matchNo: 1 };
      const result = renderOverrideMessage(
        EVENT_TYPES.OVERRIDE_APPLIED,
        sparse,
        "Game",
        "de",
      );
      expect(result).not.toBeNull();
      expect(result!.body).toContain("?");
    });
  });

  describe(EVENT_TYPES.OVERRIDE_REVERTED, () => {
    const payload = {
      matchNo: 42,
      homeTeam: "Dragons",
      guestTeam: "Bears",
      field: "kickoffTime",
      overrideValue: "19:00",
      revertedBy: "trainer@club.de",
    };

    it("renders override reverted in German", () => {
      const result = renderOverrideMessage(
        EVENT_TYPES.OVERRIDE_REVERTED,
        payload,
        "Dragons vs Bears",
        "de",
      );
      expect(result).not.toBeNull();
      expect(result!.title).toContain("ckgesetzt");
      expect(result!.body).toContain("Dragons vs Bears");
      expect(result!.body).toContain("kickoffTime");
      expect(result!.body).toContain("ckgesetzt");
      expect(result!.body).toContain("trainer@club.de");
    });

    it("renders override reverted in English", () => {
      const result = renderOverrideMessage(
        EVENT_TYPES.OVERRIDE_REVERTED,
        payload,
        "Dragons vs Bears",
        "en",
      );
      expect(result).not.toBeNull();
      expect(result!.title).toContain("Override reverted");
      expect(result!.body).toContain("has been reverted");
      expect(result!.body).toContain("by trainer@club.de");
    });
  });

  describe(EVENT_TYPES.OVERRIDE_CONFLICT, () => {
    const payload = {
      matchNo: 42,
      homeTeam: "Dragons",
      guestTeam: "Tigers",
      field: "kickoffTime",
    };

    it("renders override conflict in German", () => {
      const result = renderOverrideMessage(
        EVENT_TYPES.OVERRIDE_CONFLICT,
        payload,
        "Dragons vs Tigers",
        "de",
      );
      expect(result).not.toBeNull();
      expect(result!.title).toContain("Override-Konflikt");
      expect(result!.body).toContain("Dragons vs Tigers");
      expect(result!.body).toContain("kickoffTime");
      expect(result!.body).toContain("Konflikt");
    });

    it("renders override conflict in English", () => {
      const result = renderOverrideMessage(
        EVENT_TYPES.OVERRIDE_CONFLICT,
        payload,
        "Dragons vs Tigers",
        "en",
      );
      expect(result).not.toBeNull();
      expect(result!.title).toContain("Override conflict");
      expect(result!.body).toContain("Conflict on field kickoffTime");
      expect(result!.body).toContain("Remote value differs");
    });
  });

  describe("missing field fallbacks", () => {
    it("handles missing revertedBy, homeTeam, guestTeam in reverted (de)", () => {
      const result = renderOverrideMessage(
        EVENT_TYPES.OVERRIDE_REVERTED,
        { field: "kickoffTime" },
        "Game",
        "de",
      );
      expect(result).not.toBeNull();
      expect(result!.body).toContain("?");
      expect(result!.body).toContain(" vs ");
      expect(result!.body).not.toContain("undefined");
    });

    it("handles missing revertedBy, homeTeam, guestTeam in reverted (en)", () => {
      const result = renderOverrideMessage(
        EVENT_TYPES.OVERRIDE_REVERTED,
        { field: "kickoffTime" },
        "Game",
        "en",
      );
      expect(result).not.toBeNull();
      expect(result!.body).toContain("by ?");
      expect(result!.body).not.toContain("undefined");
    });

    it("handles missing all fields in reverted", () => {
      const result = renderOverrideMessage(
        EVENT_TYPES.OVERRIDE_REVERTED,
        {},
        "Game",
        "de",
      );
      expect(result).not.toBeNull();
      // field => "?", revertedBy => "?"
      expect(result!.body).toContain("?");
    });

    it("handles missing homeTeam, guestTeam in conflict (de)", () => {
      const result = renderOverrideMessage(
        EVENT_TYPES.OVERRIDE_CONFLICT,
        { field: "venue" },
        "Game",
        "de",
      );
      expect(result).not.toBeNull();
      expect(result!.body).toContain(" vs ");
      expect(result!.body).toContain("Konflikt");
      expect(result!.body).not.toContain("undefined");
    });

    it("handles missing homeTeam, guestTeam in conflict (en)", () => {
      const result = renderOverrideMessage(
        EVENT_TYPES.OVERRIDE_CONFLICT,
        { field: "venue" },
        "Game",
        "en",
      );
      expect(result).not.toBeNull();
      expect(result!.body).toContain(" vs ");
      expect(result!.body).toContain("Conflict on field venue");
      expect(result!.body).not.toContain("undefined");
    });

    it("handles missing all fields in conflict", () => {
      const result = renderOverrideMessage(
        EVENT_TYPES.OVERRIDE_CONFLICT,
        {},
        "Game",
        "de",
      );
      expect(result).not.toBeNull();
      expect(result!.body).toContain("?");
    });
  });

  describe("unknown event type", () => {
    it("returns null for non-override events", () => {
      const result = renderOverrideMessage(
        "match.cancelled",
        {},
        "entity",
        "de",
      );
      expect(result).toBeNull();
    });
  });
});
