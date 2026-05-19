CREATE INDEX IF NOT EXISTS "referee_games_status_kickoff_idx"
  ON "referee_games" ("sr1_status", "sr2_status", "kickoff_date");
