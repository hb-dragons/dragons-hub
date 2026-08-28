---
status: accepted
---

# Season-scoped match context

The seasons design (`docs/superpowers/specs/2026-06-24-seasons-and-new-season-onboarding-design.md`) deliberately left single-entity reads by id season-blind, so `GET /public/matches/:id/context` served an all-time head-to-head record and padded the last-five form with prior-season games — while `/public/teams/:id/stats` scoped the same form computation to the active season. This ADR reverses that exclusion: the context queries join `leagues.season_ref_id` and filter on the **match's own season**, resolved from its league.

Own season rather than active season, so a deep-linked archived match keeps a self-consistent context instead of returning an empty one. A match with no league scopes to nothing (empty record and form) rather than falling back to the all-time view. All-time aggregation was considered and rejected: squads change names, leagues and age brackets between seasons, so cross-season team identity is unreliable — and the product rule is a clean slate per season on every surface (decided 2026-08-28; the Dragons App shows the current season exclusively, see `CONTEXT.md`). Referee reads stay season-blind for now and are tracked as their own issue (#281).
