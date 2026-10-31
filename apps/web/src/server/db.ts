import 'server-only';
import postgres from 'postgres';
import { env } from './env';

export type Sql = postgres.Sql;

const globalForDb = globalThis as unknown as { sellekniSql?: Sql };

/** Direct Postgres connection (server only). Bypasses RLS: every write is validated by a route handler first. */
export function sql(): Sql {
  const url = env().DATABASE_URL;
  // Supabase's transaction pooler (port 6543, the serverless backup) has no prepared statements. The session pooler
  // caps clients at 15 and serverless instances exhausted it (P8 backup test). Keep max > 1: some code queries
  // outside an open transaction, and with one connection that waits forever.
  const pooled = new URL(url).port === '6543';
  // serverless instances are paused between requests: close idle connections fast so none is frozen half-open
  globalForDb.sellekniSql ??= postgres(url, { max: 5, idle_timeout: pooled ? 2 : 30, connect_timeout: 15, prepare: !pooled });
  return globalForDb.sellekniSql;
}
