import { describe, expect, it } from "vitest";

import { primaryTrainer, toSiteImage, type TrainerLike } from "./team-detail";

const PERSON_IMAGE = { url: "/api/media/file/person.webp", blurhash: "p" };
const TRAINER_IMAGE = { url: "/api/media/file/trainer.webp", blurhash: "t" };

function trainer(overrides: Partial<TrainerLike> = {}): TrainerLike {
  return {
    person: { name: "Emily Gust", image: PERSON_IMAGE },
    image: null,
    ...overrides,
  };
}

describe("primaryTrainer", () => {
  it("returns the first trainer's name and portrait", () => {
    expect(primaryTrainer([trainer(), trainer({ person: { name: "Zweiter" } })])).toEqual({
      name: "Emily Gust",
      image: PERSON_IMAGE,
    });
  });

  it("prefers the trainer's own image over the person portrait (legacy precedence)", () => {
    expect(primaryTrainer([trainer({ image: TRAINER_IMAGE })])).toEqual({
      name: "Emily Gust",
      image: TRAINER_IMAGE,
    });
  });

  it("carries a trainer without any image", () => {
    expect(primaryTrainer([trainer({ person: { name: "Ohne Bild", image: null } })])).toEqual({
      name: "Ohne Bild",
      image: null,
    });
  });

  it("returns null when the team has no trainers", () => {
    expect(primaryTrainer([])).toBeNull();
    expect(primaryTrainer(null)).toBeNull();
    expect(primaryTrainer(undefined)).toBeNull();
  });

  it("returns null when the trainer has no populated person", () => {
    expect(primaryTrainer([trainer({ person: null })])).toBeNull();
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
