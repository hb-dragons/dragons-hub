import { describe, expect, it } from "vitest";
import { headToHeadAverages, venueBlock, type VenueFields } from "./game-detail";

function venue(overrides: Partial<VenueFields> = {}): VenueFields {
  return {
    venueName: "Sporthalle Süd",
    venueNameOverride: null,
    venueStreet: "Musterweg 4",
    venuePostalCode: "30519",
    venueCity: "Hannover",
    ...overrides,
  };
}

describe("venueBlock", () => {
  it("joins street and city line into one address", () => {
    expect(venueBlock(venue())).toEqual({
      name: "Sporthalle Süd",
      address: "Musterweg 4, 30519 Hannover",
      mapsQuery: "Musterweg 4, 30519 Hannover",
    });
  });

  it("prefers the admin override for the name", () => {
    expect(venueBlock(venue({ venueNameOverride: "Halle am Park" }))?.name).toBe("Halle am Park");
  });

  it("searches by hall name plus city when the street is missing", () => {
    expect(venueBlock(venue({ venueStreet: null }))).toEqual({
      name: "Sporthalle Süd",
      address: "30519 Hannover",
      mapsQuery: "Sporthalle Süd, 30519 Hannover",
    });
  });

  it("offers no maps search for a bare hall name", () => {
    expect(venueBlock(venue({ venueStreet: null, venuePostalCode: null, venueCity: null }))).toEqual({
      name: "Sporthalle Süd",
      address: null,
      mapsQuery: null,
    });
  });

  it("offers no maps search for a city without a hall name or street", () => {
    expect(
      venueBlock(venue({ venueName: null, venueStreet: null, venuePostalCode: null }))?.mapsQuery,
    ).toBeNull();
  });

  it("is null when nothing about the venue is known", () => {
    expect(
      venueBlock({
        venueName: null,
        venueNameOverride: null,
        venueStreet: null,
        venuePostalCode: null,
        venueCity: null,
      }),
    ).toBeNull();
  });
});

describe("headToHeadAverages", () => {
  it("divides the totals by the games played", () => {
    expect(headToHeadAverages({ wins: 3, losses: 1, pointsFor: 312, pointsAgainst: 287 })).toEqual({
      avgFor: 78,
      avgAgainst: 72,
    });
  });

  it("is null before the first meeting", () => {
    expect(headToHeadAverages({ wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0 })).toEqual({
      avgFor: null,
      avgAgainst: null,
    });
  });
});
