import { describe, expect, it } from "vitest";
import { teamDisplayName } from "./teams";

describe("teamDisplayName", () => {
  const squad = { name: "HB Dragons 2 (Herren)", nameShort: "Dragons 2", customName: null };

  it("prefers the season's custom name", () => {
    expect(teamDisplayName({ ...squad, customName: "Herren II" })).toBe("Herren II");
  });

  it("falls back to the federation short name", () => {
    expect(teamDisplayName(squad)).toBe("Dragons 2");
  });

  it("falls back to the full name when there is no short name", () => {
    expect(teamDisplayName({ ...squad, nameShort: null })).toBe("HB Dragons 2 (Herren)");
  });

  // `teamUpdateBodySchema` accepts `customName: ""`, and the admin editor sends
  // one when a name is cleared without being nulled. A `??` chain would render
  // an empty name — and, on the Einsatz screen, match a Kampfgericht entry
  // against nothing.
  it("treats a blank custom name as absent", () => {
    expect(teamDisplayName({ ...squad, customName: "" })).toBe("Dragons 2");
    expect(teamDisplayName({ ...squad, customName: "   " })).toBe("Dragons 2");
  });

  it("treats a blank short name as absent", () => {
    expect(teamDisplayName({ ...squad, nameShort: "" })).toBe("HB Dragons 2 (Herren)");
  });
});
