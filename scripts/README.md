# scripts

| Script | Use |
|---|---|
| `env-local.mjs` (`pnpm env:local`) | Writes `.env.local` from `supabase status` + fresh random secrets. It prints key names only, never values |
| `gen-seed-sql.mjs` (`pnpm db:seed-sql`) | Generates `supabase/seed.sql` from `data/hospitals.seed.json` + `data/hospitals.national.json` (`HOSPITAL_SET` picks the set) |
| `seed-users.mts` (`pnpm db:users`) | Creates the dispatcher and hospital demo logins |
| `import-hospitals.mjs` | Builds `data/hospitals.national.json` from a national facility list (OSM, unverified) |
| `curl-demo.sh` | Drives the real ingest paths (signed SMS webhook + JSON) with the golden packets and prints what the server decided |
| `reset-demo.sh [--prod]` | Between two demo runs: restart, reseed, reset, print a red/green checklist |
| `realtime-probe.mts` (`pnpm realtime:probe`) | Prints one line per Realtime event, to check that live updates work |
| `rename-magic.mjs` | Renames the packet magic everywhere and recomputes every hard-coded CRC (dry run by default) |
| `hooks/after-edit.mjs` | Claude Code hook: re-runs the tests of `packages/shared` / `packages/tokens` after an edit there |

Most of these are wrapped by the [`./sellekni`](../sellekni) runner: see [docs/RUNNING.md](../docs/RUNNING.md).
