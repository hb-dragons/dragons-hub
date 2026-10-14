---
status: accepted
---

# A deterministic alternative-date finder replaces the AI reschedule copilot

The rescheduling copilot (`docs/superpowers/specs/2026-06-08-game-rescheduling-copilot-design.md`, decision 5: "AI-driven, no backend solver, one thin `verify_slot` tool") shipped behind `ASSISTANT_ENABLED` and did not work well in practice: the model guessed candidates and the staff member could not see which data it had read, while the actual task — answer another club's mail with the weekend days on which the game could still be played — needs a complete, explainable list, not a conversation. Decided 2026-09-10: the Hub enumerates alternative dates itself. A candidate is a weekend day in a chosen range on which neither squad has a game; for a home game the club's hall bookings at the game's current venue that day are shown alongside, and round-window and coach collisions are flags, never exclusions. The chat route, the tool registry, the MCP server and the `ASSISTANT_*` configuration are removed rather than left dormant; the hard-constraint predicates of `verify_slot` live on inside the finder. The members-only club Q&A assistant (ADR-0005) is unaffected.

Hall availability stays a manual judgment: the club's recurring hall times are not modeled, so "no booking" cannot be read as "hall free", and the finder therefore shows the booking situation instead of deciding on it. School holidays and public holidays are not modeled either; both were considered and deferred because the staff member checks them anyway when writing the reply.
