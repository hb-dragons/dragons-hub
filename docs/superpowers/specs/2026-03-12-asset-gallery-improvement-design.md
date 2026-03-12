# Asset Gallery Improvement Design

## Goal

Improve the social media asset gallery (`PhotoGrid` component) with better image display, lazy loading animations, and deletion support.

## Current State

The `PhotoGrid` component renders a 4-column grid of square cells. All images use `object-cover` (cropping non-square images), load all at once with no loading state, and have no delete UI — despite the backend fully supporting deletion via DELETE endpoints.

## Design Decisions

### Image Display

- **Contained images**: Use `object-contain` instead of `object-cover`. Images display at their natural proportions inside fixed-ratio cells, letterboxed on a dark background. No cropping, no overflow.
- **Per-grid aspect ratios**: Player photo cells use 3:4 (portrait), background cells use 1:1 (square). The `PhotoGrid` component accepts an `aspectRatio` prop to configure this.

### Loading States (Blur-Up)

- While an image loads, show a blurred low-fidelity placeholder with a subtle pulse animation.
- When the full image loads, fade it in over ~300ms.
- Cell dimensions are fixed by the aspect ratio, so no layout shift occurs during loading.
- Implementation: use an `onLoad` callback on the `<img>` element to toggle between loading and loaded states. The blur placeholder is a CSS gradient or solid color matching the `bg-muted` theme.

### Deletion

- **Hover to reveal**: A small circular ✕ button appears in the top-right corner of a cell on hover.
- **Confirmation dialog**: Clicking the ✕ opens an `AlertDialog` (from `@dragons/ui`) asking "Bild löschen?" with "Abbrechen" and "Löschen" buttons.
- **API call**: On confirm, sends `DELETE /admin/social/{player-photos|backgrounds}/:id` with `credentials: "include"`.
- **UI update**: On success, removes the item from the local list. If the deleted item was selected, clears the selection.
- **Error handling**: Shows an error toast or inline message on failure.

### Selection

- Selected item: blue ring border (`ring-2 ring-primary`) + small checkmark badge in top-left corner.
- Unselected items: subtle border, hover opacity change.
- Same click-to-select behavior as current implementation.

## Component Changes

### `PhotoGrid` (rewrite)

Props additions:
- `aspectRatio: string` — CSS aspect-ratio value (e.g. `"3/4"` or `"1/1"`)
- `onDelete: (item: T) => void` — callback after successful deletion
- `deleteEndpoint: string` — base URL for DELETE requests

Internal changes:
- Add image loading state tracking per item
- Add blur-up fade-in transition
- Add hover delete button with confirmation dialog
- Use `object-contain` with dark cell background

### `AssetSelectStep` (minor updates)

- Pass new props (`aspectRatio`, `deleteEndpoint`, `onDelete`) to each `PhotoGrid`
- Handle deletion callbacks (remove from local state, clear selection if needed)

## Backend Changes

None. The DELETE endpoints for both player photos and backgrounds already exist and are tested.

## Scope Boundaries

- No thumbnail generation or server-side blur placeholders (CSS-only approach)
- No drag-to-reorder
- No bulk delete
- No image cropping/editing UI
