import { describe, expect, it } from "vitest";

import { primaryTrainer, toSiteImage } from "./team-detail";
import type { SiteStaffMember } from "./team-staff";

function coach(overrides: Partial<SiteStaffMember> = {}): SiteStaffMember {
  return {
    id: 1,
    name: "Emily Gust",
    role: "trainer",
    licence: "C-Lizenz",
    photoUrl: "https://api.example/public/staff/1/photo?v=abc.webp",
    ...overrides,
  };
}

describe("primaryTrainer", () => {
  it("shows the first staff member — the API orders Trainer first", () => {
    expect(primaryTrainer([coach(), coach({ id: 2, name: "Ben Adler", role: "co_trainer" })])).toEqual({
      name: "Emily Gust",
      image: { url: "https://api.example/public/staff/1/photo?v=abc.webp", alt: "Emily Gust" },
    });
  });

  it("keeps a coach without a portrait, so the hero falls back to the banner", () => {
    expect(primaryTrainer([coach({ photoUrl: null })])).toEqual({
      name: "Emily Gust",
      image: null,
    });
  });

  it("returns null when the team has no staff", () => {
    expect(primaryTrainer([])).toBeNull();
    expect(primaryTrainer(null)).toBeNull();
    expect(primaryTrainer(undefined)).toBeNull();
  });
});

describe("toSiteImage", () => {
  it("resolves a relative CMS media URL against the CMS base", () => {
    expect(
      toSiteImage(
        { url: "/api/media/file/team.webp", blurhash: "h", alt: "Damen 1" },
        "http://localhost:3013",
      ),
    ).toEqual({
      url: "http://localhost:3013/api/media/file/team.webp",
      blurhash: "h",
      alt: "Damen 1",
    });
  });

  it("passes absolute URLs through untouched", () => {
    expect(toSiteImage({ url: "https://cdn.example/x.webp" }, "http://cms")).toEqual({
      url: "https://cdn.example/x.webp",
      blurhash: undefined,
      alt: undefined,
    });
  });

  it("returns null without a media doc or URL", () => {
    expect(toSiteImage(null, "http://cms")).toBeNull();
    expect(toSiteImage(undefined, "http://cms")).toBeNull();
    expect(toSiteImage({ url: null }, "http://cms")).toBeNull();
  });
});
