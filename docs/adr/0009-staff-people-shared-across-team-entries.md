---
status: accepted
---

# Staff people are shared across team entries

ADR-0008 moved club staff into the Hub as `team_staff`: one row per person per team entry, carrying the person's name, phone, email, licence and portrait. The production import from the CMS made the cost visible on day one — two of seven coaches train two teams, so they exist twice, with two portrait copies and two places to keep a phone number. An admin corrects a number twice; a referee can be shown a stale one for one of the coach's teams; and a coach's own account links to exactly one row, so "edit my contact data" (#315) would update one team and leave the other behind.

The CMS did not have this problem: `people` was a pool and `trainers` was the link to a team. The flat copy lost the pool.

Decision: split the flat row into a **staff person** and a **team staff** assignment. `staff_people` holds the human — name, phone, email, licence, portrait — once, regardless of how many teams. `team_staff` keeps its name and becomes the assignment: team entry, person, role, referee-contact flag, unique on (team entry, person). Role and the flag stay per team, so a coach can be the referee contact for one team and not the other. `user.person_id` replaces `user.staff_id`, so an account is linked to the human and survives a team change. Season rollover copies assignments with the same person id, never a copy of the person. The public `/public/teams` payload and the public portrait route keep their shape and their keys — the Website needs no change — and gain `personId` so a consumer can dedupe if it wants to.

Considered and rejected: keeping the flat table and deduplicating by name at read time (a rename splits the person again, and the writes still go to two rows); one row per person with a team list column (loses the per-team role and flag, and cannot be joined from the team side); merging people by hand in the admin UI (the duplication happens at entry time, so the fix belongs in the picker — the admin adds someone from the pool, and the unique constraint stops the same person twice).

Consequences: attaching staff is now two operations — pick a person, or create one inline — and the team's staff dialog can no longer write the person's phone number; that is the point. A one-off migration merges the existing rows by normalised name (trimmed, case-folded) and takes each field from the most recently updated row that has it; portrait objects that lose their last reference stay in the bucket. The one-off CMS -> Hub importer targeted the flat shape and is removed rather than rewritten — it has run in production and will not run again.
