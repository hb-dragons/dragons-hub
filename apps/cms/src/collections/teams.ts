import type { CollectionConfig } from "payload";

import { seoFields } from "../fields/seo";
import { dispatchOnDelete, dispatchOnPublish } from "../hooks/dispatch-rebuild";
import { anyone } from "../lib/access";

export const Teams: CollectionConfig = {
  slug: "teams",
  access: { read: anyone },
  admin: { useAsTitle: "name" },
  fields: [
    { name: "name", type: "text", required: true },
    { name: "slug", type: "text", required: true, unique: true }, // damen-1 … u18
    { name: "orderIndex", type: "number", required: true },
    { name: "teamImage", type: "upload", relationTo: "media" },
    {
      name: "apiTeamPermanentId",
      type: "number",
      unique: true,
      admin: { description: "Join-Key zu /public/teams (Sync-Daten)" },
    },
    { name: "trainers", type: "relationship", relationTo: "trainers", hasMany: true },
    {
      name: "trainingTimes",
      type: "array",
      // Mirrors the Strapi team.training component.
      fields: [
        { name: "day", type: "text", required: true },
        { name: "startTime", type: "text", required: true },
        { name: "endTime", type: "text" },
        { name: "gym", type: "text", required: true }, // plain name — deliberately NO /public/gyms endpoint
        { name: "gymMapsUrl", type: "text" },
        { name: "info", type: "text" },
      ],
    },
    ...seoFields,
  ],
  hooks: { afterChange: [dispatchOnPublish], afterDelete: [dispatchOnDelete] },
};
