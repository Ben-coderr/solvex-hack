# NAJDA (نجدة) — project memory for Claude Code

Hackathon prototype for SolveX 3.0 · Problem 1 (emergency response to road accidents in Algeria).
A phone detects a crash (or a witness reports it in 5 taps) and sends a 160-char structured SMS (DZ-MSD) or JSON; the operations room gets a merged, explainable severity estimate and a hospital recommendation; the hospital gets a pre-alert. **Complementary** to 14/1021/1055/17 — never replaces the call, never dispatches automatically. **Humans decide.**

## Read first
`docs/03-PRODUCT-SPEC.md` (what) · `docs/04-ARCHITECTURE-AND-STACK.md` (how) · `docs/05-PROTOCOL-SCORING-RANKING.md` (the contract) · `docs/06-DESIGN-AND-UX.md` (look) · `docs/11-CORRECTIONS-AND-RISKS.md` (traps). Plan and gates: `docs/09-PLAN-48H-AND-TEAM.md`.

## Status
DONE and tested: `packages/shared` (codec, CRC-8, GSM-7, Plus Codes, NSI scoring, hospital ranking, merge) and `packages/tokens` (design tokens + WCAG tests).
P0 skeletons: `apps/web` (Next 16) and `apps/mobile` (Expo SDK 58 dev build) render a real packet from `@najda/shared`.
P1 (gate-H10): `supabase/` schema+RLS+seed, `packages/api-contract`, `apps/web/src/server` (ingest, lifecycle, routing, pre-alert, SMS gateway) and `/api/*` routes.
P2 (gate-design-1): tokens fixes, web + mobile design systems, `/styleguide`.
P3 (gate-H20): dispatcher dashboard `/` (status strip, queue, MapLibre map, detail drawer, orientation, lifecycle, pre-alert, paste/simulate SMS), `/audit`, minimal hospital view `/hospital/[id]`; e2e `pnpm --filter web test:e2e`.
TODO: the native side and the remaining phases (see phase prompts P4–P8).

## Commands
```bash
pnpm install
pnpm check            # shared tests + typecheck + tokens contrast + independent Python cross-check — must be green before every merge
pnpm vectors          # regenerate golden vectors (only after an intentional protocol/scoring change, see below)
pnpm tokens           # rebuild packages/tokens/dist from tokens.json
supabase start          # local Postgres+PostGIS, Auth, Realtime (Docker/colima)
pnpm db:reset           # regenerate seed.sql from data/hospitals.seed.json + supabase db reset
pnpm env:local          # fill EMPTY keys of the root .env.local (local keys + random secrets); prints names only
pnpm db:users           # demo logins dispatcher@najda.test / hospital-a@najda.test (password: DEMO_USER_PASSWORD)
pnpm --filter web test:db   # ingest through real Postgres (truncates local incident tables)
pnpm realtime:probe     # print Realtime events as the dispatcher sees them (RLS)
pnpm --filter web test:e2e   # G2 hero flow (Playwright + installed Chrome; app running, BASE_URL=http://localhost:3001)
pnpm --filter web screens:p3 <ID>  # screenshot matrix → docs/pitch/design/p3
scripts/curl-demo.sh    # G1 drill through the signed SMS webhook (BASE_URL=http://localhost:3000)
pnpm dev:web          # = pnpm --filter web dev  (also: build | start | typecheck)
pnpm dev:mobile       # Metro for the dev build (first install: pnpm --filter mobile android, JAVA_HOME = Android Studio JBR 17)
npx expo run:android  # development build (NOT Expo Go: custom native code)
```

## Hard rules
1. **TypeScript strict everywhere.** One language end to end; logic lives in `packages/shared` and is imported, never copied.
2. **Do not change the wire format, CRC, scoring weights or ranking without the `najda-protocol` skill's procedure:** update `docs/05` → update `scripts/crosscheck.py` → `pnpm vectors` → review the vector diff → `pnpm check`. Never edit a vector by hand to make a test pass.
3. **Server is authoritative:** recompute band/score with `assess()`; the phone's band is a hint.
4. **Never drop a message.** A packet that fails to parse is stored as an unparsed report and shown raw.
5. **Secrets:** the Supabase service-role key and all `.env` values stay server-side. Never in the mobile app, never in `NEXT_PUBLIC_*`, never committed.
6. **Layering (web server code):** `domain` (pure, from `@najda/shared`) → `services` (I/O) → route handlers (thin: zod validate → service → JSON).
7. **UI:** follow the `najda-design` skill. Tokens only, no raw hex; triage colours are reserved; shape + letter + colour; RTL via logical properties; all states (loading/empty/error/offline/SMS-only).
8. **Copy and claims:** follow the `najda-medical-language` skill. Decision support, "estimated risk", disclaimer everywhere, no unsourced statistics, "rules" not "AI".
9. **SMS packets** are pure basic GSM-7 and ≤ 160 chars (A-Z 0-9 space `. , + - #`).
10. **Every feature ships with its failure state** and a test or a replay trace. Demo mode is always labelled on screen (REPLAY / DEMO).
11. **Verify, don't assume:** after UI work run the app, screenshot (360/768/1440 px, light+dark, en+ar), compare to the design, fix. After backend work, `curl` the endpoint. After protocol work, `pnpm check`.
12. Use Context7 for library docs (Expo SDK 58, Next 16, Supabase, MapLibre, Reanimated). Do not code from memory against fast-moving APIs.

## Conventions
- Branches `feat/<area>-<thing>`, small commits, message style `feat(web): …` / `fix(shared): …`. Tag gates `gate-H10`, `gate-H20`…
- `main` is always demoable. No new dependency after H30 without the team's yes.
- Keep `DECISIONS.md` (one line per decision with the hour).
- Facility names in seed data are "(illustrative)" until verified. Synthetic data only.

## Things that bit us before (don't repeat)
- `expo-sms` only opens the composer; silent SMS needs our Kotlin module (`apps/mobile/modules/najda-native`). `SEND_SMS` is Play-restricted → sideload APK.
- `expo-sensors` stops in the background → Drive mode is foreground + keep-awake; replay mode is the stage safety net.
- Check the SMS gateway's real webhook payload at docs.sms-gate.app before writing the parser.
- Supabase Realtime truncates `char(n)` to 1 char and then drops the event under RLS: never use char(n); text + CHECK.
- postgres.js v4 renders `${sql(obj, keys)}` from the keyword before it: keep it directly after `set`/`insert`, never inside a nested fragment.
- Next's env loader caches its first load and skips `.env.local` when NODE_ENV=test.
- Supabase Realtime in the browser: set the session token (`realtime.setAuth`) BEFORE subscribing, or RLS sees anon and no event ever arrives (the channel still says SUBSCRIBED).
- MapLibre v6 + Turbopack: the worker must be served from /public (`scripts/copy-map-worker.mjs`).
- Supabase Free pauses after 7 idle days. Vercel Hobby is non-commercial. Render free sleeps after 15 min.
