import { isStaff, type MyStaffProfile } from "@dragons/shared";
import type { MeStaffUpdateBody } from "@dragons/api-client";

/**
 * The coach's own contact data on the profile screen (#315).
 *
 * The screen shows the record the club holds and lets the coach change the
 * three fields they own; name, role, team and portrait belong to the admin
 * editor. Everything here is a plain function so the decisions the screen makes
 * — is there a section at all, what does the form start from, what does Save
 * actually send — are tested without rendering React Native.
 */

/** The editable fields as the form holds them: strings, never null. */
export interface ContactFields {
  phone: string;
  email: string;
  licence: string;
}

const EMPTY: ContactFields = { phone: "", email: "", licence: "" };

/**
 * Whether the profile screen draws the section at all. Read from the session
 * rather than from a request, so an account with no staff link never asks
 * `/me/staff` for a 404 it already knows it would get.
 */
export function showsStaffContact(
  session: { user?: { personId?: number | null } } | null | undefined,
): boolean {
  return isStaff(session?.user);
}

/** What the form starts from — empty inputs while the record is still loading. */
export function contactFields(profile: MyStaffProfile | undefined): ContactFields {
  if (!profile) return EMPTY;
  return {
    phone: profile.phone ?? "",
    email: profile.email ?? "",
    licence: profile.licence ?? "",
  };
}

/**
 * The patch for what the coach actually changed, or `null` when nothing did —
 * a Save that would write the record back unchanged sends no request and
 * triggers no website rebuild. An emptied field is `null` ("clear it"), which
 * is what tells it apart from a field the coach never touched.
 */
export function buildStaffPatch(
  fields: ContactFields,
  profile: MyStaffProfile | undefined,
): MeStaffUpdateBody | null {
  const current = contactFields(profile);
  const patch: MeStaffUpdateBody = {};
  let changed = false;
  for (const key of ["phone", "email", "licence"] as const) {
    const next = fields[key].trim();
    if (next === current[key].trim()) continue;
    patch[key] = next === "" ? null : next;
    changed = true;
  }
  return changed ? patch : null;
}
