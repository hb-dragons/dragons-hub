import { describe, expect, it } from "vitest";

import { BANNER_IMAGE, SOCIAL_LINKS, SOFT_BUTTON_CLASSES } from "./site-assets";

describe("BANNER_IMAGE", () => {
  it("points at the club banner with its legacy blurhash", () => {
    expect(BANNER_IMAGE.url).toBe("/img/banner.webp");
    expect(BANNER_IMAGE.blurhash).toBe("UBBgG39Z0K_4~WD%D%%M56xa-UIoIUt7n+Rj");
  });
});

describe("SOCIAL_LINKS", () => {
  it("carries the four club profiles", () => {
    expect(SOCIAL_LINKS.instagram).toContain("instagram.com/hb_dragons");
    expect(SOCIAL_LINKS.facebook).toContain("facebook.com/hbdragonsev");
    expect(SOCIAL_LINKS.youtube).toContain("youtube.com/@HanoverBasketballDragons");
    expect(SOCIAL_LINKS.linkedin).toContain("linkedin.com/company/hanover-basketball-dragons-e-v");
  });
});

describe("SOFT_BUTTON_CLASSES", () => {
  it("is the prod-lifted Nuxt UI soft-button recipe", () => {
    expect(SOFT_BUTTON_CLASSES).toContain("bg-primary/10");
    expect(SOFT_BUTTON_CLASSES).toContain("hover:bg-primary/15");
  });
});
