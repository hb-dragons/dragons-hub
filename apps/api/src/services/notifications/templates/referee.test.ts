import { describe, expect, it } from "vitest";
import { renderRefereeMessage } from "./referee";
import { EVENT_TYPES } from "@dragons/shared";

describe("renderRefereeMessage", () => {
  describe(EVENT_TYPES.REFEREE_ASSIGNED, () => {
    const payload = {
      matchNo: 10,
      homeTeam: "Dragons",
      guestTeam: "Tigers",
      refereeName: "Max Mustermann",
      role: "1. SR",
    };

    it("renders assigned in German", () => {
      const result = renderRefereeMessage(
        EVENT_TYPES.REFEREE_ASSIGNED,
        payload,
        "Dragons vs Tigers",
        "de",
      );
      expect(result).not.toBeNull();
      expect(result!.title).toContain("Schiedsrichter eingeteilt");
      expect(result!.body).toContain("Max Mustermann");
      expect(result!.body).toContain("1. SR");
      expect(result!.body).toContain("Dragons vs Tigers");
      expect(result!.body).toContain("eingeteilt");
    });

    it("renders assigned in English", () => {
      const result = renderRefereeMessage(
        EVENT_TYPES.REFEREE_ASSIGNED,
        payload,
        "Dragons vs Tigers",
        "en",
      );
      expect(result).not.toBeNull();
      expect(result!.title).toContain("Referee assigned");
      expect(result!.body).toContain("Max Mustermann");
      expect(result!.body).toContain("assigned to");
      expect(result!.body).toContain("Dragons vs Tigers");
    });

    it("handles missing payload fields gracefully", () => {
      const sparse = { matchNo: 1 };
      const result = renderRefereeMessage(
        EVENT_TYPES.REFEREE_ASSIGNED,
        sparse,
        "Game",
        "de",
      );
      expect(result).not.toBeNull();
      expect(result!.body).toContain("?");
    });
  });

  describe(EVENT_TYPES.REFEREE_UNASSIGNED, () => {
    const payload = {
      matchNo: 10,
      homeTeam: "Dragons",
      guestTeam: "Lions",
      refereeName: "Hans Schmidt",
      role: "2. SR",
    };

    it("renders unassigned in German", () => {
      const result = renderRefereeMessage(
        EVENT_TYPES.REFEREE_UNASSIGNED,
        payload,
        "Dragons vs Lions",
        "de",
      );
      expect(result).not.toBeNull();
      expect(result!.title).toContain("Schiedsrichter abgesetzt");
      expect(result!.body).toContain("Hans Schmidt");
      expect(result!.body).toContain("2. SR");
      expect(result!.body).toContain("abgesetzt");
    });

    it("renders unassigned in English", () => {
      const result = renderRefereeMessage(
        EVENT_TYPES.REFEREE_UNASSIGNED,
        payload,
        "Dragons vs Lions",
        "en",
      );
      expect(result).not.toBeNull();
      expect(result!.title).toContain("Referee unassigned");
      expect(result!.body).toContain("removed from");
    });
  });

  describe(EVENT_TYPES.REFEREE_REASSIGNED, () => {
    const payload = {
      matchNo: 10,
      homeTeam: "Dragons",
      guestTeam: "Bears",
      oldRefereeName: "Hans Schmidt",
      newRefereeName: "Peter Mueller",
      role: "1. SR",
    };

    it("renders reassigned in German", () => {
      const result = renderRefereeMessage(
        EVENT_TYPES.REFEREE_REASSIGNED,
        payload,
        "Dragons vs Bears",
        "de",
      );
      expect(result).not.toBeNull();
      expect(result!.title).toContain("Schiedsrichterwechsel");
      expect(result!.body).toContain("Peter Mueller");
      expect(result!.body).toContain("Hans Schmidt");
      expect(result!.body).toContain("ersetzt");
    });

    it("renders reassigned in English", () => {
      const result = renderRefereeMessage(
        EVENT_TYPES.REFEREE_REASSIGNED,
        payload,
        "Dragons vs Bears",
        "en",
      );
      expect(result).not.toBeNull();
      expect(result!.title).toContain("Referee reassigned");
      expect(result!.body).toContain("Peter Mueller");
      expect(result!.body).toContain("replaces");
      expect(result!.body).toContain("Hans Schmidt");
    });
  });

  describe("unknown event type", () => {
    it("returns null for non-referee events", () => {
      const result = renderRefereeMessage(
        "match.cancelled",
        {},
        "entity",
        "de",
      );
      expect(result).toBeNull();
    });
  });
});
