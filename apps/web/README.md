# web — Sellekni dispatcher, hospital and witness console

Next.js 16 (App Router, Turbopack) on the local Supabase stack. **Synthetic data only.**
Start it from the repo root with `./sellekni up` (see `docs/RUNNING.md`); project rules are in `DEVELOPMENT.md`.

## Layout

| Path | What lives there |
|---|---|
| `src/app/` | Pages: `/` dispatcher map, `/hospital`, `/audit`, `/w/[id]` public witness page (works without JS), `/demo` + `/phones` (DEMO_MODE only), `/styleguide` |
| `src/app/api/` | Route handlers: ingest (`incidents`, `sms/inbound`), witness, hospital status, pre-alert ACK, demo, health |
| `src/server/domain/` | Pure logic, no I/O (unit tested): merge rule, links, witness form, status SMS, rate limits |
| `src/server/services/` | I/O: Postgres (`postgres.js`), ingest pipeline, SMS outbox, demo scenarios |
| `src/components/` | UI by area: `dispatch/`, `hospital/`, `witness/`, `demo/`, `ui/` |
| `src/i18n/` | ar / fr / en strings; `src/brand.ts` holds every brand string |
| `src/proxy.ts` | Auth gate and locale cookie (`?lang=`) |
| `tests/e2e/` | Playwright: hero flow, P6 witness / demo |
| `scripts/` | Map worker copy, design QA, `open-demo.mts` (used by `./sellekni open`) |

## Commands (from the repo root)

```bash
pnpm --filter web test        # unit tests (vitest)
pnpm --filter web test:db     # tests against the local database
pnpm --filter web lint
pnpm --filter web typecheck
./sellekni test               # everything, including the end-to-end hero flow
```

End-to-end tests run against a production build (`NEXT_DIST_DIR=.next-e2e`), not `next dev`: see `DEVELOPMENT.md`.
After renaming CSS variables or a workspace package, delete `apps/web/.next` before building.
