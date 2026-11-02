DROP TABLE "venue_booking_matches" CASCADE;--> statement-breakpoint
DROP TABLE "venue_bookings" CASCADE;--> statement-breakpoint
-- Hand-written: the booking due-date setting went with the stored bookings (ADR-0012).
DELETE FROM app_settings WHERE key = 'venue_booking_due_days_before';
