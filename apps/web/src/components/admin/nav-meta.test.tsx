// Guards the sidebar nav table; see nav-meta.ts.
import { describe, expect, it } from "vitest";
import { SURFACES } from "@dragons/shared";
import { SURFACE_META, WEB_ONLY_EXEMPT_SURFACES } from "./nav-meta";
import en from "@/messages/en.json";
import de from "@/messages/de.json";

describe("sidebar surface coverage", () => {
  it("gives every surface either a nav entry or a recorded exemption", () => {
    // The sidebar drops a surface with no SURFACE_META entry without a word, so
    // an admin page can exist, be permitted, and still be reachable only by
    // typing its URL. That is what happened to /admin/seasons.
    const unlinked = SURFACES.map((s) => s.id)
      .filter((id) => !(id in SURFACE_META) && !(id in WEB_ONLY_EXEMPT_SURFACES))
      .sort();

    expect(
      unlinked,
      "add these to SURFACE_META, or to WEB_ONLY_EXEMPT_SURFACES with the reason",
    ).toEqual([]);
  });

  it("does not carry nav entries for surfaces that no longer exist", () => {
    const surfaceIds = new Set(SURFACES.map((s) => s.id));
    const stale = Object.keys(SURFACE_META).filter((id) => !surfaceIds.has(id));

    expect(stale).toEqual([]);
  });

  it("has an en and de label for every nav entry", () => {
    const messages: Record<string, Record<string, unknown>> = {
      en: en as Record<string, Record<string, unknown>>,
      de: de as Record<string, Record<string, unknown>>,
    };
    const missing: string[] = [];
    for (const [id, meta] of Object.entries(SURFACE_META)) {
      const key = meta.labelKey.replace(/^nav\./, "");
      for (const locale of ["en", "de"]) {
        if (typeof messages[locale]!["nav"]![key] !== "string") {
          missing.push(`${locale}:${meta.labelKey} (surface ${id})`);
        }
      }
    }
    expect(missing).toEqual([]);
  });
});
