---
status: accepted
---

# Per-season team entries own club-facing team identity

A club team exists twice in the domain and the schema now says so. The **squad** (`teams`) is the federation's identity: `api_team_permanent_id` follows the same group of players for life, aging up through brackets — last season's U14 squad is this season's U16 squad. The **team entry** (`team_entries`) is the club's view: that squad fielded in one season, carrying the custom name, badge color, game duration, display order, and exactly one connected league (or none). Entries are the source of truth for team↔league on every surface.

We got here because the league connection used to be derived, not stored: an unscoped join over `standings` that picked the alphabetically first league name across all seasons a squad ever played in. The first new season made it visibly wrong (a U16 team "connected" to the U14 league it played the year before) and unfixable (there was no data to edit). The alternatives were patching that join with a season filter — which still leaves the connection underivable whenever the federation table is empty, and leaves nothing to edit — or making `teams` itself season-scoped, which breaks the one-row-per-permanent-id assumption that matches, standings, and referee data all join through.

Consequences to respect:

- Club-facing fields live only on the entry. Do not re-add `custom_name`, `badge_color`, `estimated_game_duration`, or `display_order` to `teams`.
- One entry per squad per season (`unique(team_id, season_id)`), one connected league per entry. Tracking a second competition for the same squad in the same season is a schema change, not a second link row.
- Manual link edits are gap-fillers: positive federation evidence supersedes them (logged in the sync log). Code that makes manual edits permanent breaks the reconciliation contract.
- Custom names deliberately do not carry forward between seasons; they are age labels and go stale by design. Color, duration, and order do carry forward.
