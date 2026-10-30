# Sellekni (internal codename NAJDA / نجدة) — Development & Architecture Guide

> Product name **Sellekni** (team decision 2026-10-30). `NAJDA`, `@najda/*`, `x-najda-key` stay as internal codenames. The wire magic is renamed only with `node scripts/rename-magic.mjs <MAGIC> --write` (see docs/12). Brand strings live in one `src/brand.ts` per app.

Hackathon prototype for SolveX 3.0 · Problem 1 (emergency response to road accidents in Algeria).
A phone detects a crash (or a witness reports it in 5 taps) and sends a 160-char structured SMS (DZ-MSD) or JSON; the operations room gets a merged, explainable severity estimate and a hospital recommendation; the hospital gets a pre-alert. **Complementary** to 14/1021/1055/17 — never replaces the call, never dispatches automatically. **Humans decide.**

## Read first
`docs/03-PRODUCT-SPEC.md` (what) · `docs/04-ARCHITECTURE-AND-STACK.md` (how) · `docs/05-PROTOCOL-SCORING-RANKING.md` (the contract) · `docs/06-DESIGN-AND-UX.md` (look) · `docs/11-CORRECTIONS-AND-RISKS.md` (traps) · `docs/12-DECISIONS-REBRAND-OBD-IOT.md` (rebrand, OBD/IoT decisions) · `docs/13-PHONE-SENSING-PLAN.md` (the detector and the Realme field guide). For the pitch only: `docs/14` BMC, `docs/15` jury map and corrected Q&A, `docs/16` OBD/box roadmap; diagrams in `docs/diagrams/`. **Time left (2026-10-30): 24 h → follow `docs/17-24H-PLAN.md`** (cut list, hour blocks, gates). Longer plan: `docs/09-PLAN-48H-AND-TEAM.md`.

## Status
DONE and tested: `packages/shared` (codec, CRC-8, GSM-7, Plus Codes, NSI scoring, hospital ranking, merge), `packages/tokens` (design tokens + WCAG and logo tests) and `packages/detector` (range-aware phone crash detector, synthetic scenarios, replay traces; **integrate it, never rewrite it**).
P0 skeletons: `apps/web` (Next 16) and `apps/mobile` (Expo SDK 58 dev build) render a real packet from `@najda/shared`.
P1 (gate-H10): `supabase/` schema+RLS+seed, `packages/api-contract`, `apps/web/src/server` (ingest, lifecycle, routing, pre-alert, SMS gateway) and `/api/*` routes.
P2 (gate-design-1): tokens fixes, web + mobile design systems, `/styleguide`.
P3 (gate-H20): dispatcher dashboard `/` (status strip, queue, MapLibre map, detail drawer, orientation, lifecycle, pre-alert, paste/simulate SMS), `/audit`, minimal hospital view `/hospital/[id]`; e2e `pnpm --filter web test:e2e`.
P4 (in progress, `feat/mobile-core`): mobile shell, onboarding, Drive mode, countdown, alert state machine, outbox, replay; adapter onto `@najda/detector`.
P6 (`demo-v1-rc1`): witness page `/w/[id]?k=` (no-JS form, signed link, merge into the linked incident, QR in the drawer), `/demo` + `/phones` (scenarios, verified reset, stopwatch), D14 status SMS, rate-limit review (limits in DECISIONS.md). Crew page and in-app witness mode cut (docs/17 §2).
TODO: the remaining phases (see phase prompts P7–P8 and the cut list in docs/17).

## Commands
Quickest: `./najda up` (Docker → Supabase → env + demo logins → web), `./najda open` (signed-in dispatcher + hospital windows),
`./najda test`, `./najda down`. Run/test guide with accounts: `README.md`.
```bash
pnpm install
pnpm check            # shared tests + typecheck + tokens contrast + independent Python cross-check — must be green before every merge
pnpm vectors          # regenerate golden vectors (only after an intentional protocol/scoring change, see below)
pnpm tokens           # rebuild packages/tokens/dist from tokens.json
pnpm --filter @najda/detector report   # scenario x sensor-range table (docs/13 §4) · also: `test`, `traces`
supabase start          # local Postgres+PostGIS, Auth, Realtime (Docker/colima)
pnpm db:reset           # regenerate seed.sql from data/hospitals.seed.json + supabase db reset
pnpm env:local          # fill EMPTY keys of the root .env.local (local keys + random secrets); prints names only
pnpm db:users           # demo logins dispatcher@najda.test / hospital-a@najda.test (password: DEMO_USER_PASSWORD)
pnpm --filter web test:db   # ingest through real Postgres (truncates local incident tables)
pnpm realtime:probe     # print Realtime events as the dispatcher sees them (RLS)
pnpm --filter web test:e2e   # hero flow + P6 (Playwright + installed Chrome; app running, BASE_URL=http://localhost:3001)
#   run it against a production build (next dev reload-loops here):  cd apps/web && NEXT_DIST_DIR=.next-e2e pnpm exec next build && NEXT_DIST_DIR=.next-e2e pnpm exec next start -p 3001
#   P6_SCREENS=1 also writes docs/pitch/design/p6; add --output <dir outside the repo>
pnpm --filter web screens:p3 <ID>  # screenshot matrix → docs/pitch/design/p3
scripts/curl-demo.sh    # G1 drill through the signed SMS webhook (BASE_URL=http://localhost:3000)
pnpm dev:web          # = pnpm --filter web dev  (also: build | start | typecheck)
pnpm dev:mobile       # Metro for the dev build (first install: pnpm --filter mobile android, JAVA_HOME = Android Studio JBR 17)
npx expo run:android  # development build (NOT Expo Go: custom native code)
```

## Hard rules
1. **TypeScript strict everywhere.** One language end to end; logic lives in `packages/shared` and is imported, never copied.
2. **Do not change the wire format, CRC, scoring weights or ranking without the protocol guard procedure:** update `docs/05` → update `scripts/crosscheck.py` → `pnpm vectors` → review the vector diff → `pnpm check`. Never edit a vector by hand to make a test pass.
3. **Server is authoritative:** recompute band/score with `assess()`; the phone's band is a hint.
4. **Never drop a message.** A packet that fails to parse is stored as an unparsed report and shown raw.
5. **Secrets:** the Supabase service-role key and all `.env` values stay server-side. Never in the mobile app, never in `NEXT_PUBLIC_*`, never committed.
6. **Layering (web server code):** `domain` (pure, from `@najda/shared`) → `services` (I/O) → route handlers (thin: zod validate → service → JSON).
7. **UI:** follow the design constitution (`docs/guidelines/design-constitution.md`). Tokens only, no raw hex; triage colours are reserved; shape + letter + colour; RTL via logical properties; all states (loading/empty/error/offline/SMS-only).
8. **Copy and claims:** follow the medical language guidelines (`docs/guidelines/medical-language.md`). Decision support, "estimated risk", disclaimer everywhere, no unsourced statistics, "rules" not "AI".
9. **SMS packets** are pure basic GSM-7 and ≤ 160 chars (A-Z 0-9 space `. , + - #`).
10. **Every feature ships with its failure state** and a test or a replay trace. Demo mode is always labelled on screen (REPLAY / DEMO).
11. **Verify, don't assume:** after UI work run the app, screenshot (360/768/1440 px, light+dark, en+ar), compare to the design, fix. After backend work, `curl` the endpoint. After protocol work, `pnpm check`.
12. **Phone sensors are the main path.** OBD and the plug-in box are roadmap (docs/16); the only box item in the 48 h is the simulated `BOX` replay. Detector thresholds are assumptions in `PARAMS`; change them only with evidence, logged in `DECISIONS.md`.
13. Use Context7 or official documentation for library docs (Expo SDK 58, Next 16, Supabase, MapLibre, Reanimated). Do not code from memory against fast-moving APIs.

## Conventions
- Branches `feat/<area>-<thing>`, small commits, message style `feat(web): …` / `fix(shared): …`. Tag gates `gate-H10`, `gate-H20`…
- `main` is always demoable. No new dependency after H30 without the team's yes.
- Keep `DECISIONS.md` (one line per decision with the hour).
- Facility names in seed data are "(illustrative)" until verified. Synthetic data only.

## Things that bit us before (don't repeat)
- **Phone accelerometers saturate at ~±8–16 g (device-specific).** `packages/detector` is range-aware; `G` from a phone is a lower bound; never present a phone-measured "38 g"; Δv comes from GPS only (docs/12 §3, docs/13). Read the real range and sampling rate on the Realme first (docs/13 §6.3, T1 and T3).
- OBD-II gives speed (PID `0D`), **not** airbag status; hardware/OBD is roadmap, not part of the 48 h build (docs/12 §4–5).
- `expo-sms` only opens the composer; silent SMS needs our Kotlin module (`apps/mobile/modules/najda-native`). `SEND_SMS` is Play-restricted → sideload APK.
- `expo-sensors` stops in the background → Drive mode is foreground + keep-awake; replay mode is the stage safety net.
- Check the SMS gateway's real webhook payload at docs.sms-gate.app before writing the parser.
- Supabase Realtime truncates `char(n)` to 1 char and then drops the event under RLS: never use char(n); text + CHECK.
- postgres.js v4 renders `${sql(obj, keys)}` from the keyword before it: keep it directly after `set`/`insert`, never inside a nested fragment.
- Next's env loader caches its first load and skips `.env.local` when NODE_ENV=test.
- Supabase Realtime in the browser: set the session token (`realtime.setAuth`) BEFORE subscribing, or RLS sees anon and no event ever arrives (the channel still says SUBSCRIBED).
- `rename-magic.mjs` cannot see packets built from a literal CRC (`.replace('#04', …)`) or elided with `…`, and it shifts lengths again in docs already converted: derive bad CRCs from the wire (`corruptCrc`), review `git diff docs/`.
- The root `.gitignore` ignores every `android/`; local Expo modules are re-included (`!apps/mobile/modules/*/android/`). Check autolinking with the project's own binary, not a bare `npx expo-modules-autolinking` (it can resolve another version and miss `modules/`).
- MapLibre v6 + Turbopack: the worker must be served from /public (`scripts/copy-map-worker.mjs`).
- Supabase Free pauses after 7 idle days. Vercel Hobby is non-commercial. Render free sleeps after 15 min.
