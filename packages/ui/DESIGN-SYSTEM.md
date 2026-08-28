# Dragon's Lair Design System Reference

This document defines the visual language for the Dragons admin UI. All agents building UI must follow these rules. The design originates from the Stitch project "Dragons" with two design systems: **"The Kinetic Vault"** (dark) and **"The Elite Architect"** (light).

## Source of Truth

- **Stitch project:** `projects/6536303684079353503`
- **Design tokens:** `packages/ui/src/styles/globals.css`
- **Spec:** `docs/superpowers/specs/2026-04-13-stitch-design-integration-design.md`

## Core Design Rules

### 1. No-Line Rule (CRITICAL)

**Never use 1px borders to section content.** Define boundaries through tonal surface shifts instead.

```
DO:    bg-surface-low, bg-surface-high, bg-muted
DON'T: border-b, border-r, border-t, border-l (for layout sectioning)
```

Borders are acceptable for:
- Form controls (inputs, selects) — use `border-border/20` (ghost border)
- Focus/accessibility rings — use `ring-ring/50`
- The `Separator` component — uses `bg-border/15` (ghost line)

### 2. Tonal Surface Layering

Hierarchy is achieved through background color shifts, not shadows or borders.

| Token | Light | Dark | Usage |
|---|---|---|---|
| `surface-lowest` | #ffffff | #0e0e0e | Cards on page, highest-contrast containers |
| `surface-low` | #f3f4f5 | #1b1b1b | Table headers, card footers, subtle sections |
| `surface-base` | #edeeef | #1f1f1f | Middle container tier |
| `surface-high` | #e7e8e9 | #2a2a2a | Row hover, interactive elevation, active tabs (dark) |
| `surface-highest` | #e1e3e4 | #353535 | Highest elevation containers |
| `surface-bright` | #f8f9fa | #393939 | Active tabs (dark), maximum emphasis |

**Nesting rule:** Place lighter surfaces on darker backgrounds to create "lift."
- Light mode: white cards (#ffffff) on off-white background (#f8f9fa)
- Dark mode: elevated cards (#2a2a2a) on dark background (#131313)

### 3. Typography

One family across the club's surfaces — Bricolage Grotesque, the public
site's face — with roles separated by weight and case, not family. JetBrains
Mono covers tabular/log data. The `font-display` / `font-sans` split stays in
the markup: the tokens both resolve to Bricolage today, and the semantic
distinction is what lets a future display face slot in without a sweep.

| Role | Font | CSS Variable | Usage |
|---|---|---|---|
| **Display/Headlines** | Bricolage Grotesque | `font-display` | Page titles, KPI values, section headings |
| **Body/Data** | Bricolage Grotesque | `font-sans` | Paragraphs, table cells, form labels |
| **Labels** | Bricolage Grotesque | `font-display` | Table headers, badge text, small captions |
| **Mono/Data** | JetBrains Mono | `font-mono` | Scoreboard debug, sync logs, IDs |

**Page titles:** `font-display text-4xl font-bold uppercase tracking-tight`
**Table headers:** `font-display text-xs font-medium uppercase tracking-wide text-muted-foreground`
**KPI values:** `font-display text-3xl font-bold`

### 4. Sharp Corners

The design uses tight, athletic radii. Never use `rounded-xl` or `rounded-2xl`.

| Component | Class | Value |
|---|---|---|
| Buttons | `rounded-md` | 0.25rem (4px) |
| Cards | `rounded-md` | 0.25rem (4px) |
| Inputs/Selects | `rounded-md` | 0.25rem (4px) |
| Dialogs | `rounded-md` | 0.25rem (4px) |
| Badges/Chips | `rounded-4xl` | pill shape (only exception) |

### 5. Dragon Shadows

Large blur, low opacity, tinted with `on-surface` color. No hard drop shadows.

```css
/* Already defined in globals.css */
--shadow: 0 8px 32px rgba(on-surface, 0.06);    /* default */
--shadow-md: 0 12px 40px rgba(on-surface, 0.06); /* medium */
--shadow-lg: 0 20px 50px rgba(on-surface, 0.08); /* large */
```

Use shadows only for floating elements (popovers, dropdowns, modals). Cards use tonal layering, not shadows.

## Color Token Mapping

### Primary Palette (Brand Green)

| Token | Light | Dark | Purpose |
|---|---|---|---|
| `primary` | #004b23 | #84d997 | Button fills, text links, active states |
| `primary-foreground` | #ffffff | #003919 | Text on primary backgrounds |

### Secondary Palette (Sage Green — informational)

| Token | Light | Dark | Purpose |
|---|---|---|---|
| `secondary` | #c8eccb | #2a4a30 | Badge backgrounds, secondary buttons |
| `secondary-foreground` | #4c6c51 | #c8eccb | Text on secondary backgrounds |

**Important:** Secondary is sage green in BOTH modes. It is NOT orange.

### Heat Palette (Orange — urgency/CTAs)

| Token | Light | Dark | Purpose |
|---|---|---|---|
| `heat` | #953d00 | #ed691f | Urgent items, live indicators, countdown alerts |
| `heat-foreground` | #ffffff | #4c1a00 | Text on heat backgrounds |
| `heat-subtle` | #ffb692 | #ffb695 | Subtle heat backgrounds |

Use `text-heat` or `bg-heat` when you need orange for urgency. Never use `--secondary` for this.

### Info Palette (Blue — neutral emphasis)

| Token | Light | Dark | Purpose |
|---|---|---|---|
| `info` | #1447e6 | #51a2ff | File-type badges, body links in rich text |
| `info-foreground` | #ffffff | #052f6b | Text on info backgrounds |
| `info-subtle` | #8ec5ff | #8ec5ff | Link hover, subtle info backgrounds |

Blue carries no status meaning here. Use it for informational chrome, never for
success or error — those are `--primary` and `--destructive`.

### Accent (Interactive hover/focus)

| Token | Light | Dark | Purpose |
|---|---|---|---|
| `accent` | #e7e8e9 | #2a2a2a | Menu item hover, select item focus |
| `accent-foreground` | #191c1d | #e2e2e2 | Text in hovered/focused state |

Accent is a **neutral surface shift**, not a brand color. It provides subtle highlight for interactive items in menus, selects, dropdowns, and command palettes.

### Brand (Deep Green — decorative)

| Token | Light | Dark | Purpose |
|---|---|---|---|
| `brand` | #006631 | #006631 | Decorative brand elements, gradients |
| `brand-foreground` | #8be19f | #8be19f | Text on brand backgrounds |

Use for hero sections, brand badges, or gradient effects. Not for interactive elements.

## Component Conventions

### Form Controls (Input, Textarea, Select, TimePicker, DatePicker)

```
Background: bg-input (light: #f3f4f5, dark: #1f1f1f)
Border:     border-border/20 (ghost border, 20% opacity)
Radius:     rounded-md
Focus:      focus-visible:border-ring focus-visible:ring-ring/50
```

All form controls share the same visual treatment. The DatePicker uses `Button variant="outline"` which also uses `bg-input`.

### Buttons

| Variant | Style |
|---|---|
| `default` | `bg-primary text-primary-foreground` — solid brand green |
| `outline` | `bg-input border-border/20` — filled with ghost border, matches form inputs |
| `secondary` | `bg-secondary text-secondary-foreground` — sage green |
| `ghost` | `bg-transparent hover:bg-muted` — no fill until hover |
| `destructive` | `bg-destructive/10 text-destructive` — tinted red |

### Badges

| Variant | Light | Dark | Use For |
|---|---|---|---|
| `default` | Green fill | Green fill | Confirmed, active, primary status |
| `secondary` | Sage green | Dark sage green | Informational labels, categories |
| `destructive` | Red tint | Red tint | Errors, cancelled, failed |
| `success` | Green tint | Green tint | Success states |
| `outline` | Border only | Border only | Neutral labels, metadata |

### Tables

- **Header row:** `bg-surface-low` background, `font-display text-xs uppercase tracking-wide text-muted-foreground`
- **Body rows:** No background, `hover:bg-surface-high` on hover
- **Footer row:** `bg-surface-low`
- **No borders between rows** — use tonal layering
- **Own-club highlight:** `border-l-2 border-l-primary/50 bg-primary/5`

### Cards

- Background: `bg-card` (light: #ffffff, dark: #2a2a2a)
- Radius: `rounded-md`
- No border, no ring — tonal lift provides separation
- Footer: `bg-surface-low` for tonal section break

### Floating Elements (Popover, Dropdown, Select, Dialog)

- Background: `bg-popover` (light: #ffffff, dark: #353535)
- Shadow: `shadow-md` or `shadow-lg`
- Border: `ring-1 ring-foreground/10` (ghost ring, not `border`)
- Radius: `rounded-md`

### Separators

Use `bg-border/15` — a ghost line at 15% opacity. Prefer adding whitespace (`space-y-8`, `gap-6`) over visible separators.

### Sidebar

- No `border-r` or `border-l` — tonal shift separates sidebar from content
- Sub-menu connector: `border-l border-sidebar-border/15` (ghost)
- Active item: `bg-sidebar-accent`
- Brand text: `font-display font-bold uppercase tracking-tight`

## Shared Layout Components

Located in `apps/web/src/components/admin/shared/`:

### PageHeader

Display title for all admin pages. Every admin page must use this.

```tsx
<PageHeader
  title="Page Title"           // font-display text-4xl uppercase
  subtitle="Optional subtitle" // text-muted-foreground text-sm
  badges={[{ label: "Label", value: "42" }]}  // optional stat badges
>
  {/* Optional children: action buttons */}
</PageHeader>
```

### StatCard

KPI metric card with label, value, optional icon and trend indicator. `trend` is
the already-formatted string to show next to the value; `trendUp` picks its
colour (`text-primary` when true, `text-heat` when false).

```tsx
<StatCard label="Referees" value="24" icon={Users} trend="+3" trendUp />
```

### PageError

Failure notice for a page whose data is fetched during the server render.
`ErrorState` (`components/ui/error-state.tsx`) is the interactive counterpart
and requires an `onRetry`; a server component has no client handler to offer.

```tsx
<PageError message={error} />
```

### TeamBadge

The one team badge. Always pass `badgeColor` — without it the preset falls back
to a hash of the name, so a team with a configured colour renders differently on
every surface that forgets it. Never pick `preset.light` or `preset.dark` by
hand: `preset.className` carries both modes.

```tsx
<TeamBadge name="Dragons U18" badgeColor={match.homeBadgeColor} />
```

## Enforcement

`pnpm check:design-tokens` (run in CI) compiles every colour utility found in
`apps/web/src` and `packages/ui/src` against this file's tokens and fails on any
Tailwind cannot resolve. A token that does not exist emits no CSS rule and no
error, so `text-mint-shade` passes typecheck, lint and every render test while
showing the user nothing — that check is the only thing that catches it.

Two consequences for how you write classes:

- Invent a token in `globals.css` before you use it, or use one that exists.
- Class names must appear verbatim in source. Building one at runtime
  (`` `bg-${colour}-500` ``) produces no rule, and the check cannot see it either.

## Do's and Don'ts

### Do
- Use `font-display` for all headings and labels
- Use tonal surface shifts to create visual hierarchy
- Use `--heat` tokens for urgency/live/CTA elements
- Use generous whitespace (`py-4 px-6`, `space-y-8`)
- Use `rounded-md` for everything except badges/chips

### Don't
- Use 1px borders for content sectioning
- Use `rounded-lg`, `rounded-xl`, or `rounded-2xl` on components
- Use `--secondary` for orange/urgency — use `--heat` instead
- Use raw Tailwind colors (`green-500`, `red-600`) — use design tokens
- Use traditional drop shadows on cards — use tonal layering
- Use pure black (#000000) — use `--foreground` tokens
