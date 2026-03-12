# Social Wizard Improvement — Design Spec

## Problem

The social media post wizard's first step requires manually entering a calendar week number and year — disconnected from how users think about dates. Completed steps disappear as the user progresses, losing context. The flow works but feels clunky and disconnected from the existing schedule infrastructure.

## Design Decisions

Decisions made during brainstorming:

1. **Accordion with context strips** over single-page layout — keeps familiar step flow while maintaining visibility of earlier choices
2. **Action cards** for step 1 — two cards ("Ergebnisse" / "Vorschau") showing the relevant weekend and match count, one click to start
3. **Reuse existing API** — no new backend endpoint; two parallel fetches of `GET /admin/social/matches` on mount to populate card match counts
4. **Disabled cards for zero matches** — cards with 0 matches are visible but grayed out
5. **Preserve state on back-navigation** — asset selections survive when going back; matches re-fetch only if week/type changed
6. **Keep scope focused** — no new sidebar pages, no asset library, no history; just improve the create flow

## Step 1: Action Cards

Replaces the current type toggle + raw week/year number inputs + "Spiele laden" button.

**Weekend calculation:**
- "Last weekend" = the most recent Saturday–Sunday that is fully in the past. If today is Saturday or Sunday, the current weekend is NOT yet "last weekend" — it is still in progress. "Last weekend" means the previous Sat–Sun.
- "Upcoming weekend" = the next Saturday–Sunday that hasn't started yet. If today is Saturday or Sunday, "upcoming" is next week's weekend.
- Edge case: if today is Monday, "last weekend" was yesterday/day-before. This is correct — results are typically posted on Monday.

**On page load:**
- Calculate both weekends using the rules above
- Derive ISO week numbers and years from the Saturday dates
- Fetch `GET /admin/social/matches?type=results&week={lastWeek}&year={lastYear}` and `GET /admin/social/matches?type=preview&week={nextWeek}&year={nextYear}` in parallel
- Populate two side-by-side action cards with match counts
- While fetching, show skeleton/loading state on both cards (pulsing placeholder for match count)

**Card content:**
- Post type label ("Ergebnisse" / "Vorschau")
- Context label ("Letztes Wochenende" / "Kommendes Wochenende")
- Calendar week + date range (e.g., "KW 11 · Sa 8. – So 9. Mär")
- Match count (e.g., "4 Spiele mit Ergebnis")

**Interactions:**
- Click a card with matches → copies `WeekendOption.matches` into `state.matches`, sets `postType`, `calendarWeek`, `year` → auto-advance to step 2 (immediate, no delay)
- Cards with 0 matches are visible but disabled (grayed out, no click handler)
- "Andere Woche wählen" link below cards expands a prev/next weekend picker (chevron arrows with date label, same pattern as public schedule's `WeekendPicker`). Renders inline below the cards. Dismissible by clicking the link again (toggles). Starts at the default weekends. There is one shared picker that shifts both cards simultaneously — results always shows week N, preview shows week N+1. Navigation bounds: up to 8 weeks in each direction (covers a typical half-season). Navigating triggers fresh fetches for both cards.

## Collapsed Context Strips

When a step is completed and the user advances, it collapses into a summary strip instead of disappearing.

**Navigation model:**
- The existing step indicator nav bar (numbered circles with labels) is **removed** — the collapsed strips replace its function
- Strictly one step expanded at a time (true accordion). Clicking "Ändern" on a collapsed strip collapses the currently active step (if any beyond it) and expands the clicked step.
- `WizardState.step` continues to represent the currently active (expanded) step. A new field `WizardState.furthestStep` tracks the highest step reached, so strips know which steps have been completed and should render.

**Strip content:**

| Step | Summary |
|------|---------|
| 1. Typ & Woche | `Ergebnisse · KW 11 (Sa 8. – So 9. Mär 2025)` |
| 2. Spiele | `4 Spiele · Herren 1, Damen, U16, U14` |
| 3. Assets | Thumbnail of selected photo + thumbnail of selected background |

Step 4 (Preview) is always the final active step and never collapses.

**Asset thumbnails:** The strip for step 3 needs image URLs. Currently `WizardState` stores `selectedPhoto` (full `PlayerPhoto` object) but only `selectedBackgroundId` (no object). Add `selectedBackground: Background | null` to `WizardState` so the strip can derive the thumbnail URL from `background.id` via the existing `GET /admin/social/backgrounds/:id/image` endpoint. Thumbnails render at 40x40px with `object-cover` and rounded corners, inline in the strip.

**Back-navigation behavior:**
- Clicking "Ändern" on a strip sets `state.step` back to that step number; `furthestStep` stays unchanged
- Asset selections always survive
- Matches re-fetch only if `calendarWeek` or `postType` actually changed compared to what was used for the current matches. The `post-wizard.tsx` component owns the match data and the re-fetch decision. When the user picks a new card in step 1, the wizard compares the new week/type to the previous values. If different, it copies the fresh `WeekendOption.matches` into `state.matches` (the `WeekendOption` already has the latest data from the card fetch). If same, it keeps existing matches (preserving any reorder/removal the user did in step 2).
- Match loading/error state is owned by `post-wizard.tsx` (lifted from `match-review-step.tsx`). The wizard passes `matches`, `matchesLoading`, and `matchesError` as props to both `post-type-step` (for card counts) and `match-review-step` (for the list).

## Type Changes

```typescript
// New type in types.ts
interface WeekendOption {
  week: number;
  year: number;
  dateFrom: string; // YYYY-MM-DD (Saturday)
  dateTo: string;   // YYYY-MM-DD (Sunday)
  matchCount: number;
  matches: MatchItem[]; // pre-fetched matches, used when card is clicked
}

// WizardState additions
interface WizardState {
  // ... existing fields ...
  furthestStep: 1 | 2 | 3 | 4;          // highest step reached (initial: 1)
  selectedBackground: Background | null;  // full object for strip thumbnail (initial: null)
}

// getInitialState() must include: furthestStep: 1, selectedBackground: null
```

## File Changes

**Modified files:**

| File | Change |
|------|--------|
| `components/admin/social/post-wizard.tsx` | Remove step indicator nav, add collapsed strip rendering, fetch weekend data on mount, own match data and re-fetch logic, track `furthestStep` |
| `components/admin/social/steps/post-type-step.tsx` | Rewrite to action cards with match counts, optional week picker |
| `components/admin/social/steps/match-review-step.tsx` | Remove internal fetch logic; receive `matches` as prop and call `onUpdate` for reorder/remove only |
| `components/admin/social/steps/asset-select-step.tsx` | Store full `Background` object in state via `onUpdate({ selectedBackgroundId: bg.id, selectedBackground: bg })` |
| `components/admin/social/types.ts` | Add `WeekendOption` type, add `furthestStep` and `selectedBackground` to `WizardState` |

**New files:**

| File | Purpose |
|------|---------|
| `components/admin/social/collapsed-step-summary.tsx` | Summary strip for completed steps — renders strip content per step, "Ändern" link |

**No changes to:**
- API routes or backend services
- Database schema
- Other admin pages
- `preview-step.tsx`
