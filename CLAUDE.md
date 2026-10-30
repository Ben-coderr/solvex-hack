# NAJDA (نجدة) — project memory for Claude Code

Hackathon prototype for SolveX 3.0 · Problem 1 (emergency response to road accidents in Algeria).
A phone detects a crash (or a witness reports it in 5 taps) and sends a 160-char structured SMS (DZ-MSD) or JSON; the operations room gets a merged, explainable severity estimate and a hospital recommendation; the hospital gets a pre-alert. **Complementary** to 14/1021/1055/17 — never replaces the call, never dispatches automatically. **Humans decide.**

## Read first
`docs/03-PRODUCT-SPEC.md` (what) · `docs/04-ARCHITECTURE-AND-STACK.md` (how) · `docs/05-PROTOCOL-SCORING-RANKING.md` (the contract) · `docs/06-DESIGN-AND-UX.md` (look) · `docs/11-CORRECTIONS-AND-RISKS.md` (traps). Plan and gates: `docs/09-PLAN-48H-AND-TEAM.md`.

## Status
DONE and tested: `packages/shared` (codec, CRC-8, GSM-7, Plus Codes, NSI scoring, hospital ranking, merge) and `packages/tokens` (design tokens + WCAG tests).
TODO: `apps/web`, `apps/mobile`, `supabase/`, `data/`, `scripts/` (see phase prompts P0–P8).

## Commands
```bash
pnpm install
pnpm check            # shared tests + typecheck + tokens contrast + independent Python cross-check — must be green before every merge
pnpm vectors          # regenerate golden vectors (only after an intentional protocol/scoring change, see below)
pnpm tokens           # rebuild packages/tokens/dist from tokens.json
supabase start | supabase db reset
pnpm --filter web dev | build | start
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
- Supabase Free pauses after 7 idle days. Vercel Hobby is non-commercial. Render free sleeps after 15 min.
