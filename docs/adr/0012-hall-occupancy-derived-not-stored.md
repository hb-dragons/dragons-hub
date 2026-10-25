---
status: accepted
---

# Hall occupancy is derived, not stored

The club used to keep a venue booking per hall and day (`venue_bookings`, linked to its games through `venue_booking_matches`). Sync recomputed them after every run, staff could create, edit and delete them by hand, give each a status (pending, requested, confirmed, cancelled), override its window, add notes and a due date, and four events (`booking.created`, `booking.status.changed`, `booking.needs_reconfirmation`, `booking.hall_time.missing`) announced the changes. ADR-0011 then brought the Anlage T into the model: the city approves the club's hall times for the whole season in one sheet, so whether a home game day is covered can be read straight from the hall time. The per-day request workflow the booking status tracked was not used in practice; nobody files a request per day when the sheet already holds the season.

Decided 2026-10-25: nothing about a home game day is stored. The Hallenbelegung list (`GET /admin/hall-occupancy`) groups the live home games at our halls by venue and day and derives the programme window from the games plus the buffer and game-duration settings, and the coverage from the day's hall time, on every read. The two tables are dropped, along with the sync's reconcile step, the booking routes, contracts and client endpoints, the due-date setting (`venue_booking_due_days_before`) and the four events. The buffer and game-duration settings keep their `venue_booking_` keys and the `booking` permission resource keeps its name.

Consequences: there is no history of past bookings, no per-day status, override window, note or "confirmed by"; a day's window is whatever the current games and settings give. There is nothing to reconcile, so a moved game or a changed hall time shows up on the next read without a sync step or an event. The four booking events are retired rather than deleted from the vocabulary: rows already in `domain_events` stay listable and render generically, and a watch rule that names one keeps it until edited, but nothing can publish one again.
