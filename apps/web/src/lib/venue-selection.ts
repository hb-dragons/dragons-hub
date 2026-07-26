/**
 * Venue comboboxes show free text but submit a venue id. Keeping those as two
 * independent pieces of state lets a form hold two contradictory answers to
 * "which venue is this?" — a stale id from an earlier pick plus a name the user
 * has since typed over.
 *
 * The rule here is that the visible text wins: a remembered selection only
 * contributes its id while the text still names that venue. Any free-text edit
 * invalidates the id instead of silently attaching it to a different name.
 */
export interface SelectedVenue {
  id: number;
  label: string;
}

export function resolveVenueId(
  selected: SelectedVenue | null | undefined,
  text: string | null | undefined,
): number | null {
  if (!selected) return null;
  const typed = (text ?? "").trim();
  return typed === selected.label.trim() ? selected.id : null;
}
