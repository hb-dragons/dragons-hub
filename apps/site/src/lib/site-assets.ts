/**
 * Shared chrome constants: fixed assets and prod-lifted style recipes that
 * more than one component renders (NavBar, PageHeader, FollowUs, footer…).
 */

/** Club banner with the blurhash the legacy site shipped (UiBannerImage). */
export const BANNER_IMAGE = {
  url: "/img/banner.webp",
  blurhash: "UBBgG39Z0K_4~WD%D%%M56xa-UIoIUt7n+Rj",
} as const;

/** Official club profiles (footer + Social Wall). */
export const SOCIAL_LINKS = {
  instagram: "https://www.instagram.com/hb_dragons/",
  facebook: "https://www.facebook.com/hbdragonsev/",
  youtube: "https://www.youtube.com/@HanoverBasketballDragons",
  linkedin: "https://www.linkedin.com/company/hanover-basketball-dragons-e-v",
} as const;

/** Nuxt UI "soft" button, classes lifted from prod hbdragons.de markup. */
export const SOFT_BUTTON_CLASSES =
  "rounded-md font-medium inline-flex items-center transition-colors px-3 py-2 text-base gap-2 text-primary bg-primary/10 hover:bg-primary/15";
