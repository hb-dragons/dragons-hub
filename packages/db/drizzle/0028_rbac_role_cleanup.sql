-- RBAC role cleanup: null out legacy "user" and "referee" role values.
-- The "user" role is dropped (default state is now role = null).
-- Self-service for referees derives from user.referee_id, not a role value.
-- "admin" rows are left unchanged.

UPDATE "user" SET role = NULL WHERE role = 'user';
--> statement-breakpoint
UPDATE "user" SET role = NULL WHERE role = 'referee';
