# Unified Social Post Template Design

## Goal

Make the social media image preview match the exported image by sharing a single template definition between the frontend preview and the backend Satori renderer.

## Current State

The preview (`image-preview.tsx`) and export (`social-image.service.ts`) use completely different rendering code. The preview is a hand-coded CSS approximation with different layout structure, font sizes, spacing, and visual elements compared to the Satori template (`PostLayout`, `WeekendPreview`, `WeekendResults`). They've drifted apart — different match row layouts, different legend styles, different font stacks, hard-coded vs dynamic footer text.

## Design Decisions

### Template Sharing

Move the three template files from `apps/api/src/services/social/templates/` to `packages/shared/src/social-templates/`:
- `shared.tsx` (PostLayout + MatchRow type + DEFAULT_THEME)
- `weekend-preview.tsx` (WeekendPreview)
- `weekend-results.tsx` (WeekendResults)

Both `@dragons/api` (Satori) and `@dragons/web` (native React) import from a new subpath export `@dragons/shared/social-templates`. The templates use only inline `style` props (required by Satori), which also work as native browser React.

Add `react` as a peer dependency to `@dragons/shared` (both consumers already have it).

### Theme Type

Templates accept an optional `theme` prop with configurable styling values:

```ts
interface PostTheme {
  awayBgColor: string;
  awayBorderColor: string;
  awayLegendBgColor: string;
  textColor: string;
  titleFontSize: number;
  matchFontSize: number;
  subtitleFontSize: number;
  opponentFontSize: number;
  legendFontSize: number;
  footerFontSize: number;
}
```

When omitted, templates use `DEFAULT_THEME` constants matching current hardcoded values. This keeps current behavior unchanged while enabling future admin UI configuration.

### Fonts

Copy `LeagueSpartan-Regular.ttf`, `LeagueSpartan-Bold.ttf`, `LeagueSpartan-ExtraBold.ttf`, and `greatertheory.otf` into `apps/web/public/fonts/`. Add `@font-face` declarations in the app's global CSS. The preview renders with the exact same fonts as Satori.

### Preview Component Changes

`image-preview.tsx` replaces its CSS approximation text overlay with the actual template component rendered inside a scaled-down container:

```tsx
<div style={{
  position: "absolute", inset: 0,
  transform: `scale(${1 / SCALE_FACTOR})`,
  transformOrigin: "top left",
  width: 1080, height: 1080
}}>
  {state.postType === "preview"
    ? <WeekendPreview calendarWeek={state.calendarWeek} matches={mappedMatches} footer={footer} />
    : <WeekendResults calendarWeek={state.calendarWeek} matches={mappedMatches} footer={footer} />
  }
</div>
```

The 1080px template renders at 50% scale (via CSS transform) to fit the 540px preview container. The "Generiertes Bild kann leicht abweichen" disclaimer is removed.

### Match Data Mapping

The frontend `MatchItem` type needs to be mapped to the template's `MatchRow` type in the preview component. Both types have `teamLabel`, `opponent`, `isHome`, `kickoffTime`, `homeScore`, `guestScore` — the mapping is straightforward.

## What Stays the Same

- Player photo drag/drop layer in preview — unchanged
- Background image layer in preview — unchanged
- Server-side image generation pipeline (Satori -> Resvg -> Sharp compositing) — unchanged, just imports from new location
- API route and generate endpoint — unchanged

## Scope Boundaries

- No admin UI for theme configuration (future work)
- No changes to the image generation pipeline itself
- No changes to player photo or background handling
- No changes to the wizard flow or steps
