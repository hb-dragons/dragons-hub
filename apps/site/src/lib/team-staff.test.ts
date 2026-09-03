import { describe, expect, it } from "vitest";

import {
  clubCoaches,
  fetchTeamStaff,
  headCoach,
  staffFor,
  teamStaffIndex,
  type SiteTeamStaff,
} from "./team-staff";

function member(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    firstName: "Emily",
    lastName: "Gust",
    role: "trainer",
    licence: "C-Lizenz",
    photoUrl: "/public/staff/1/photo?v=abc.webp",
    ...overrides,
  };
}

const TEAMS = [
  {
    id: 10,
    apiTeamPermanentId: 160402,
    name: "Dragons Herren 1",
    isOwnClub: true,
    displayOrder: 1,
    staff: [member(), member({ id: 2, firstName: "Ben", lastName: "Adler", role: "co_trainer" })],
  },
  {
    id: 11,
    apiTeamPermanentId: 320674,
    name: "Dragons Damen 1",
    isOwnClub: true,
    displayOrder: 2,
    staff: [member({ id: 3, licence: null, photoUrl: null })],
  },
  { id: 12, apiTeamPermanentId: 999, name: "Rivals", isOwnClub: false },
];

function fetchReturning(status: number, body: unknown): typeof fetch {
  return (async () => new Response(JSON.stringify(body), { status })) as typeof fetch;
}

describe("fetchTeamStaff", () => {
  it("keeps own-club teams and resolves portrait URLs against the API base", async () => {
    const teams = await fetchTeamStaff("https://api.example/", fetchReturning(200, TEAMS));

    expect(teams).toEqual([
      {
        apiTeamPermanentId: 160402,
        displayOrder: 1,
        staff: [
          {
            id: 1,
            name: "Emily Gust",
            role: "trainer",
            licence: "C-Lizenz",
            photoUrl: "https://api.example/public/staff/1/photo?v=abc.webp",
          },
          {
            id: 2,
            name: "Ben Adler",
            role: "co_trainer",
            licence: "C-Lizenz",
            photoUrl: "https://api.example/public/staff/1/photo?v=abc.webp",
          },
        ],
      },
      {
        apiTeamPermanentId: 320674,
        displayOrder: 2,
        staff: [{ id: 3, name: "Emily Gust", role: "trainer", licence: null, photoUrl: null }],
      },
    ]);
  });

  it("gives an own-club team without the key an empty staff list", async () => {
    const teams = await fetchTeamStaff(
      "https://api.example",
      fetchReturning(200, [{ apiTeamPermanentId: 1, isOwnClub: true }]),
    );

    expect(teams).toEqual([{ apiTeamPermanentId: 1, displayOrder: 0, staff: [] }]);
  });

  it("throws on a non-200 so the build fails loudly", async () => {
    await expect(fetchTeamStaff("https://api.example", fetchReturning(503, []))).rejects.toThrow(
      "teams: HTTP 503 for https://api.example/public/teams",
    );
  });

  it("throws when the payload drifts out of shape", async () => {
    await expect(
      fetchTeamStaff("https://api.example", fetchReturning(200, [{ apiTeamPermanentId: "x" }])),
    ).rejects.toThrow();
  });
});

describe("staffFor", () => {
  it("finds a team's coaches by federation permanent id", async () => {
    const index = teamStaffIndex(
      await fetchTeamStaff("https://api.example", fetchReturning(200, TEAMS)),
    );

    expect(staffFor(index, 160402).map((s) => s.name)).toEqual(["Emily Gust", "Ben Adler"]);
    expect(staffFor(index, 999)).toEqual([]);
    expect(staffFor(index, null)).toEqual([]);
    expect(staffFor(index, undefined)).toEqual([]);
  });
});

describe("headCoach", () => {
  it("takes the first entry, which the API orders Trainer first", () => {
    const staff = [
      { id: 1, name: "Emily Gust", role: "trainer", licence: null, photoUrl: null },
      { id: 2, name: "Ben Adler", role: "co_trainer", licence: null, photoUrl: null },
    ];
    expect(headCoach(staff)?.name).toBe("Emily Gust");
  });

  it("returns null for a team without staff", () => {
    expect(headCoach([])).toBeNull();
  });
});

describe("clubCoaches", () => {
  const teams: SiteTeamStaff[] = [
    {
      apiTeamPermanentId: 2,
      displayOrder: 2,
      staff: [{ id: 3, name: "Nina Wolf", role: "trainer", licence: null, photoUrl: null }],
    },
    {
      apiTeamPermanentId: 1,
      displayOrder: 1,
      staff: [
        { id: 1, name: "Emily Gust", role: "trainer", licence: "C", photoUrl: null },
        { id: 2, name: "Ben Adler", role: "co_trainer", licence: null, photoUrl: null },
      ],
    },
  ];

  it("lists every coach, teams in display order", () => {
    expect(clubCoaches(teams).map((c) => c.name)).toEqual(["Emily Gust", "Ben Adler", "Nina Wolf"]);
  });

  it("shows a coach of two teams once, keeping the higher-ordered team's row", () => {
    const withRepeat: SiteTeamStaff[] = [
      ...teams,
      {
        apiTeamPermanentId: 3,
        displayOrder: 3,
        staff: [{ id: 9, name: "emily gust", role: "co_trainer", licence: null, photoUrl: null }],
      },
    ];

    const coaches = clubCoaches(withRepeat);

    expect(coaches.map((c) => c.name)).toEqual(["Emily Gust", "Ben Adler", "Nina Wolf"]);
    expect(coaches[0]!.licence).toBe("C");
  });

  it("leaves the input array untouched", () => {
    const order = teams.map((t) => t.apiTeamPermanentId);
    clubCoaches(teams);
    expect(teams.map((t) => t.apiTeamPermanentId)).toEqual(order);
  });

  it("returns nothing without teams", () => {
    expect(clubCoaches([])).toEqual([]);
  });
});
