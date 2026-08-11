import type { CollectionConfig } from "payload";

// Editors sign in with email + password; the site build reader authenticates
// with an API key (`Authorization: users API-Key <key>`).
export const Users: CollectionConfig = {
  slug: "users",
  auth: { useAPIKey: true },
  admin: { useAsTitle: "email" },
  fields: [],
};
