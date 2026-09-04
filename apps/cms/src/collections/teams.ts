import type { CollectionConfig } from "payload";

import { seoFields } from "../fields/seo";
import { dispatchOnDelete, dispatchOnPublish } from "../hooks/dispatch-rebuild";
import { publishedOrAuthed } from "../lib/access";

// Coaches and the league are deliberately absent: the Hub owns club staff
// (`team_staff`, ADR-0008) and the league comes from the sync data, so the site
// joins both on apiTeamPermanentId instead of reading a CMS copy (issue #316).
export const Teams: CollectionConfig = {
  slug: "teams",
  versions: { drafts: true },
  access: { read: publishedOrAuthed },
  admin: { useAsTitle: "name" },
  // Drag-and-drop ordering in the list view (issue: /teams ordering). Payload
  // injects a hidden fractional-index `_order` field; the site sorts by it.
  // Replaced the hand-numbered `orderIndex` — the migration seeds `_order`
  // from the old values, so the published order survives the switch.
  orderable: true,
  fields: [
    { name: "name", type: "text", required: true },
    { name: "slug", type: "text", required: true, unique: true }, // damen-1 … u18
    { name: "teamImage", type: "upload", relationTo: "media" },
    {
      name: "apiTeamPermanentId",
      type: "number",
      unique: true,
      admin: { description: "Join-Key zu /public/teams (Sync-Daten)" },
    },
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
