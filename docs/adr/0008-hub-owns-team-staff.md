---
status: accepted
---

# The Hub owns team staff; the CMS keeps presentation

Coaches existed twice: the CMS held `teams.trainers → trainers → people` (name, email, phone, licence, photo) for the Website's team pages, and the Hub had a `coach` permission role with no person behind it and no link to any team. When the referee Einsatz screen needed the coach of the Dragons team as team contact (decided 2026-09-02), the phone number the referee needs sat in a system the API does not talk to, in a collection whose read access is `anyone`.

Decision: team staff is a Hub entity (`team_staff`, attached to a team entry per ADR-0004, carried forward at season rollover, optionally linked to a user account like `user.refereeId`). The Hub owns name, role, licence, phone, email, referee-contact flag and the portrait, and serves the public subset (name, role, licence, photo) on `/public/teams`; phone and email reach only referees assigned to that game and admins. The Website reads staff from the Hub at build time and the Hub triggers the site rebuild on change, the same way a CMS publish does. The CMS `trainers` collection and the dead `teams.leagueName` / `teams.leagueId` fields are removed; the CMS keeps team photo, prose, training times and SEO. `people` stays for Vorstand and positions, which have no Hub counterpart.

Considered and rejected: the API reading the CMS at request time (a new runtime dependency and a public-read collection as the source of a referee-only phone number); a slim CMS `trainers` doc holding only a Hub id and the portrait (a hand-maintained join id per coach, and the first field someone forgets); matching CMS people to Hub staff by name (breaks on the first rename).

Consequences: the split rule is "operational data about people in club roles lives in the Hub, page content lives in the CMS" — a future Jugendkoordinator or Betreuer belongs in `team_staff` with a new role value, not in the CMS. `people.phone` in the CMS is now unused by any surface and should go, or its read access should stop being `anyone`.
