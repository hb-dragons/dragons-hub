import { createDb, type Database } from "@dragons/db";
import type { Pool } from "pg";
import { env } from "./env";

let _db: Database | undefined;
let _pool: Pool | undefined;

export function getDb(): Database {
  if (!_db) {
    const created = createDb(env.DATABASE_URL);
    _db = created.db;
    _pool = created.pool;
  }
  return _db;
}

export async function closeDb(): Promise<void> {
  if (_pool) {
    await _pool.end();
    _pool = undefined;
    _db = undefined;
  }
}
