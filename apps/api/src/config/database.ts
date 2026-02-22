import { createDb, type Database } from "@dragons/db";
import { env } from "./env";

let _db: Database | undefined;

export const db: Database = new Proxy({} as Database, {
  get(_target, prop) {
    if (!_db) {
      _db = createDb(env.DATABASE_URL);
    }
    return (_db as unknown as Record<string | symbol, unknown>)[prop];
  },
});
