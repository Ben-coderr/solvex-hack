import 'server-only';
import postgres from 'postgres';
import { env } from './env';

export type Sql = postgres.Sql;

const globalForDb = globalThis as unknown as { sellekniSql?: Sql };

/** Direct Postgres connection (server only). Bypasses RLS: every write is validated by a route handler first. */
export function sql(): Sql {
  globalForDb.sellekniSql ??= postgres(env().DATABASE_URL, { max: 5, idle_timeout: 30 });
  return globalForDb.sellekniSql;
}
