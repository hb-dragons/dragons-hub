import { describe, expect, it } from "vitest";

import {
  describePortrait,
  describeRow,
  newRows,
  planPortraits,
  planStaffRows,
  splitName,
  staffKey,
  type ExistingStaff,
} from "./mappers";
import type { CmsMedia, CmsTeam, CmsTrainer } from "./cms";

function team(extra: Partial<CmsTeam> = {}): CmsTeam {
  return {
    id: 1,
    name: "Damen 1",
    slug: "damen-1",
    apiTeamPermanentId: 100,
    trainers: [],
    ...extra,
  };
}

function trainer(id: number, extra: Partial<CmsTrainer> = {}): CmsTrainer {
  return { id, person: { id: id * 10, name: "Max Mustermann" }, ...extra };
}

const entries = new Map<number, number>([[100, 7]]);

describe("splitName", () => {
  it("splits on the last space", () => {
    expect(splitName("Max Mustermann")).toEqual({ firstName: "Max", lastName: "Mustermann" });
  });

  it("keeps a middle name with the first name", () => {
    expect(splitName("Anna Lena von Berg")).toEqual({
      firstName: "Anna Lena von",
      lastName: "Berg",
    });
  });

  it("puts a single token in the first name", () => {
    expect(splitName("Mo")).toEqual({ firstName: "Mo", lastName: "" });
  });

  it("collapses surrounding and repeated whitespace", () => {
    expect(splitName("  Max   Mustermann \n")).toEqual({
      firstName: "Max",
      lastName: "Mustermann",
    });
  });
});

describe("staffKey", () => {
  it("ignores case and surrounding space", () => {
    expect(staffKey({ teamEntryId: 7, firstName: " Max ", lastName: "MUSTERMANN" })).toBe(
      staffKey({ teamEntryId: 7, firstName: "max", lastName: "mustermann" }),
    );
  });

  it("separates the same name on two entries", () => {
    expect(staffKey({ teamEntryId: 7, firstName: "Max", lastName: "M" })).not.toBe(
      staffKey({ teamEntryId: 8, firstName: "Max", lastName: "M" }),
    );
  });
});

describe("planStaffRows", () => {
  it("maps a trainer onto the matched team entry", () => {
    const plan = planStaffRows(
      [
        team({
          trainers: [
            trainer(1, {
              licence: "B-Lizenz",
              email: "trainer@example.de",
              person: { id: 10, name: "Max Mustermann", phone: "0170", email: "p@example.de" },
            }),
          ],
        }),
      ],
      entries,
    );

    expect(plan.rows).toEqual([
      {
        teamEntryId: 7,
        firstName: "Max",
        lastName: "Mustermann",
        role: "trainer",
        phone: "0170",
        email: "trainer@example.de",
        licence: "B-Lizenz",
      },
    ]);
    expect(plan.skipped).toEqual([]);
  });

  it("falls back to the person's email and treats blanks as unset", () => {
    const plan = planStaffRows(
      [
        team({
          trainers: [
            trainer(1, {
              licence: "   ",
              email: "",
              person: { id: 10, name: "Max Mustermann", phone: "", email: "p@example.de" },
            }),
          ],
        }),
      ],
      entries,
    );

    expect(plan.rows[0]).toMatchObject({ email: "p@example.de", phone: null, licence: null });
  });

  it("skips a team without trainers", () => {
    expect(planStaffRows([team({ trainers: null })], entries).rows).toEqual([]);
  });

  it("skips a trainer with no person, naming it", () => {
    const plan = planStaffRows([team({ trainers: [{ id: 3, person: null }] })], entries);

    expect(plan.rows).toEqual([]);
    expect(plan.skipped).toEqual(['damen-1: trainer 3 has no person — skipped']);
  });

  it("skips a person whose name is blank", () => {
    const plan = planStaffRows(
      [team({ trainers: [trainer(4, { person: { id: 40, name: "   " } })] })],
      entries,
    );

    expect(plan.rows).toEqual([]);
    expect(plan.skipped).toEqual(['damen-1: trainer 4 has no person — skipped']);
  });

  it("drops a name repeated on the same team entry", () => {
    const plan = planStaffRows(
      [team({ trainers: [trainer(1), trainer(2, { person: { id: 20, name: "max MUSTERMANN" } })] })],
      entries,
    );

    expect(plan.rows).toHaveLength(1);
  });

  it("keeps the same person on two team entries", () => {
    const plan = planStaffRows(
      [team({ trainers: [trainer(1)] }), team({ id: 2, slug: "herren-1", apiTeamPermanentId: 200, trainers: [trainer(1)] })],
      new Map([
        [100, 7],
        [200, 8],
      ]),
    );

    expect(plan.rows.map((row) => row.teamEntryId)).toEqual([7, 8]);
  });

  it("throws naming a team whose permanent id has no entry", () => {
    expect(() => planStaffRows([team({ trainers: [trainer(1)] })], new Map())).toThrow(
      /damen-1.*100/,
    );
  });

  it("throws naming a team that carries no permanent id", () => {
    expect(() =>
      planStaffRows([team({ apiTeamPermanentId: null, trainers: [trainer(1)] })], entries),
    ).toThrow(/damen-1/);
  });

  it("names every unmatched team in one error", () => {
    expect(() =>
      planStaffRows(
        [
          team({ trainers: [trainer(1)] }),
          team({ id: 2, slug: "herren-1", apiTeamPermanentId: 200, trainers: [trainer(2)] }),
        ],
        new Map(),
      ),
    ).toThrow(/2 CMS team\(s\)[\s\S]*damen-1[\s\S]*herren-1/);
  });

  it("throws when a relation arrived unpopulated", () => {
    expect(() => planStaffRows([team({ trainers: [5] })], entries)).toThrow(/depth/);
    expect(() => planStaffRows([team({ trainers: [{ id: 6, person: 60 }] })], entries)).toThrow(
      /depth/,
    );
  });
});

describe("describeRow", () => {
  it("names the empty contact fields, so the run log records what was missing", () => {
    expect(
      describeRow({
        teamEntryId: 7,
        firstName: "Max",
        lastName: "Mustermann",
        role: "trainer",
        phone: null,
        email: null,
        licence: null,
      }),
    ).toBe("entry 7: Max Mustermann (no licence, no email, no phone)");
  });

  it("names what the trainer carries", () => {
    expect(
      describeRow({
        teamEntryId: 7,
        firstName: "Max",
        lastName: "Mustermann",
        role: "trainer",
        phone: "0170",
        email: "max@example.de",
        licence: "B-Lizenz",
      }),
    ).toBe("entry 7: Max Mustermann (B-Lizenz, max@example.de, 0170)");
  });
});

describe("newRows", () => {
  const row = {
    teamEntryId: 7,
    firstName: "Max",
    lastName: "Mustermann",
    role: "trainer" as const,
    phone: null,
    email: null,
    licence: null,
  };

  it("keeps a row the hub does not have", () => {
    expect(newRows([row], new Set())).toEqual([row]);
  });

  it("drops a row already on that entry, whatever the case", () => {
    expect(newRows([row], new Set([staffKey({ ...row, firstName: "MAX" })]))).toEqual([]);
  });
});

describe("planPortraits", () => {
  function media(id: number, extra: Partial<CmsMedia> = {}): CmsMedia {
    return { id, url: `/api/media/file/${id}.jpg`, mimeType: "image/jpeg", ...extra };
  }

  function existing(extra: Partial<ExistingStaff> = {}): ExistingStaff {
    return {
      id: 42,
      teamEntryId: 7,
      firstName: "Max",
      lastName: "Mustermann",
      photoFilename: null,
      ...extra,
    };
  }

  it("copies the trainer's own image rather than the person's", () => {
    const plan = planPortraits(
      [
        team({
          trainers: [
            trainer(1, {
              image: media(1),
              person: { id: 10, name: "Max Mustermann", image: media(2) },
            }),
          ],
        }),
      ],
      entries,
      [existing()],
    );

    expect(plan.copies).toEqual([
      {
        staffId: 42,
        teamEntryId: 7,
        name: "Max Mustermann",
        sourceUrl: "/api/media/file/1.jpg",
        contentType: "image/jpeg",
      },
    ]);
    expect(plan.skipped).toEqual([]);
    expect(plan.alreadyThere).toBe(0);
  });

  it("falls back to the person's image", () => {
    const plan = planPortraits(
      [team({ trainers: [trainer(1, { person: { id: 10, name: "Max Mustermann", image: media(2, { mimeType: "image/webp" }) } })] })],
      entries,
      [existing()],
    );

    expect(plan.copies).toMatchObject([{ sourceUrl: "/api/media/file/2.jpg", contentType: "image/webp" }]);
  });

  it("reports a trainer without any image and skips it", () => {
    const plan = planPortraits([team({ trainers: [trainer(1)] })], entries, [existing()]);

    expect(plan.copies).toEqual([]);
    expect(plan.skipped).toEqual(["damen-1: Max Mustermann has no image — skipped"]);
  });

  it("leaves a row that already has a portrait alone", () => {
    const plan = planPortraits(
      [team({ trainers: [trainer(1, { image: media(1) })] })],
      entries,
      [existing({ photoFilename: "kept.jpg" })],
    );

    expect(plan.copies).toEqual([]);
    expect(plan.skipped).toEqual([]);
    expect(plan.alreadyThere).toBe(1);
  });

  it("reports a trainer whose staff row the hub does not hold", () => {
    const plan = planPortraits([team({ trainers: [trainer(1, { image: media(1) })] })], entries, []);

    expect(plan.copies).toEqual([]);
    expect(plan.skipped).toEqual([
      "damen-1: Max Mustermann has no staff row — run the staff import first",
    ]);
  });

  it("matches the staff row by entry and name, whatever the case", () => {
    const plan = planPortraits(
      [team({ trainers: [trainer(1, { image: media(1) })] })],
      entries,
      [existing({ firstName: "MAX", lastName: "mustermann" })],
    );

    expect(plan.copies).toHaveLength(1);
  });

  it("plans one copy per team entry for a coach on two teams", () => {
    const plan = planPortraits(
      [
        team({ trainers: [trainer(1, { image: media(1) })] }),
        team({ id: 2, slug: "herren-1", apiTeamPermanentId: 200, trainers: [trainer(1, { image: media(1) })] }),
      ],
      new Map([
        [100, 7],
        [200, 8],
      ]),
      [existing(), existing({ id: 43, teamEntryId: 8 })],
    );

    expect(plan.copies.map((copy) => copy.staffId)).toEqual([42, 43]);
  });

  it("plans one copy for a name repeated on the same entry", () => {
    const plan = planPortraits(
      [team({ trainers: [trainer(1, { image: media(1) }), trainer(2, { image: media(3) })] })],
      entries,
      [existing()],
    );

    expect(plan.copies).toHaveLength(1);
  });

  it("reports a trainer it cannot name", () => {
    const plan = planPortraits([team({ trainers: [{ id: 3, person: null }] })], entries, []);

    expect(plan.skipped).toEqual(["damen-1: trainer 3 has no person — skipped"]);
  });

  it("skips an image type the hub does not store", () => {
    const plan = planPortraits(
      [team({ trainers: [trainer(1, { image: media(1, { mimeType: "image/gif" }) })] })],
      entries,
      [existing()],
    );

    expect(plan.copies).toEqual([]);
    expect(plan.skipped).toEqual([
      "damen-1: Max Mustermann has an image/gif image, which the hub does not store — skipped",
    ]);
  });

  it("skips an image the CMS did not type", () => {
    const plan = planPortraits(
      [team({ trainers: [trainer(1, { image: media(1, { mimeType: null }) })] })],
      entries,
      [existing()],
    );

    expect(plan.skipped).toEqual([
      "damen-1: Max Mustermann has an untyped image, which the hub does not store — skipped",
    ]);
  });

  it("skips a media doc that carries no url", () => {
    const plan = planPortraits(
      [team({ trainers: [trainer(1, { image: media(1, { url: null }) })] })],
      entries,
      [existing()],
    );

    expect(plan.copies).toEqual([]);
    expect(plan.skipped).toEqual(["damen-1: Max Mustermann has an image (media 1) without a url — skipped"]);
  });

  it("throws when an image arrived as a bare id", () => {
    expect(() =>
      planPortraits([team({ trainers: [trainer(1, { image: 5 })] })], entries, [existing()]),
    ).toThrow(/depth/);
    expect(() =>
      planPortraits(
        [team({ trainers: [trainer(1, { person: { id: 10, name: "Max Mustermann", image: 5 } })] })],
        entries,
        [existing()],
      ),
    ).toThrow(/depth/);
  });

  it("throws naming a team whose permanent id has no entry", () => {
    expect(() => planPortraits([team({ trainers: [trainer(1)] })], new Map(), [])).toThrow(
      /damen-1.*100/,
    );
  });
});

describe("describePortrait", () => {
  it("names the row, the entry and the image type", () => {
    expect(
      describePortrait({
        staffId: 42,
        teamEntryId: 7,
        name: "Max Mustermann",
        sourceUrl: "/api/media/file/1.jpg",
        contentType: "image/jpeg",
      }),
    ).toBe("staff 42 (entry 7, Max Mustermann, image/jpeg)");
  });
});
