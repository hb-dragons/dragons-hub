-- One-off repair for the sync bug where a federation change confined to an
-- overridden field (typically kickoffTime) advanced remote_data_hash without
-- writing a new remote snapshot, leaving the official value stale. The hash
-- then matched on every later run, so the fixed sync would never revisit those
-- matches. Clearing it on every match the club ever edited (an override row or
-- a local version) makes the next sync compare them against the federation
-- once; a match with no real change writes no version and just re-hashes.
UPDATE "matches" SET "remote_data_hash" = NULL
WHERE "id" IN (
  SELECT "match_id" FROM "match_overrides"
  UNION
  SELECT "match_id" FROM "match_local_versions"
);
