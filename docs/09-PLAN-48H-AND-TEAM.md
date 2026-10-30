# 09 — Plan: 48 hours, 4 people (adapt to your reality)

> **ASSUMPTIONS (confirm and edit):** 48 h hackathon · 4 people · Android demo phones available · you may use open-source libraries and AI coding tools. **If you do not know the hackathon's rules on pre-written code, ask the organisers before you start** (question list in `00-START-HERE.md`). The starter pack contains a ready, tested protocol package: *disclose it* as an AI-assisted, open-source-style building block, and be ready to show everything else built during the event.

## 1. Roles

| Role | Owns | Primary tools |
|---|---|---|
| **A — Mobile** | `apps/mobile`, native SMS module, detector, replay, outbox | Expo skills, Context7 |
| **B — Web & API** | `apps/web`, Supabase schema, ingest, realtime, pre-alert | Supabase MCP, shadcn, Playwright |
| **C — Shared, data, maps** | `packages/shared` upkeep, hospital data, OSRM/PMTiles, ETA, traces, measurements | Context7 |
| **D — Design, pitch, demo** | Figma, tokens, all UI polish, slides, video, demo script, rehearsal | Figma MCP, frontend-design, sellekni-design |

3 people: merge C into B. 2 people: A+C, B+D and use the **cut list** (§4) from the start. Solo: dashboard + `/phones` + Simulate SMS + witness page only; mobile = replay mode UI without the native module.

## 2. Timeline with gates

*The first column lists which phase prompts (`02-PHASE-PROMPTS.md`, P0–P8) run in each window; each person pastes only the prompt for their own stream (roles in §1).*

| Hours | A Mobile | B Web/API | C Shared/Data | D Design/Pitch | Gate |
|---|---|---|---|---|---|
| **0–2** P0 | clone, tooling check, Expo project + dev build on phone | Next app + Supabase local | verify `pnpm check`; hospital data plan | Figma file, tokens → CSS | **G0 (H2):** `pnpm check` green on 4 laptops · MCPs connected · everyone can run the app skeleton |
| **2–10** P1 · P2 · P4 | Drive-mode screen, sensors/location permissions, i18n skeleton | migrations + seed, `POST /api/incidents`, `POST /api/sms/inbound`, ingest service (decode → assess → merge → store), Realtime | Overpass → CSV → seed hospitals (10–20, curated); OSRM Docker up (or ORS key) | Foundations + components in Figma (`TriageMarker`, `PacketChip`, `GoldenRing`, `ReasonList`) | **G1 (H10):** paste an SMS in a `curl` → incident row + assessment + Realtime event |
| **10–20** P3 · P4 | **detector + replay engine** with unit tests; countdown screen | dashboard: map, queue, incident detail, lifecycle | routing service (OSRM→ORS→haversine), recommendations endpoint | dashboard + mobile screens in Figma (priority: Countdown, Alert status, Dispatcher home) | **G2 (H20):** *whole flow on the dashboard with "Simulate SMS"* — pin → detail → orientation → pre-alert → hospital ACK → audit |
| **20–30** P5 · P3 polish | alert pipeline: outbox, HTTPS channel, **native SMS module**, status screen | pre-alert SMS through the real gateway, hospital view and audit polish (minimal versions already exist for G2) | gateway phone setup + webhook fixtures; PMTiles for the demo region | implement design polish on both apps; RTL pass; start slides | **G3 (H24):** replay on phone → HTTPS → pin · **G4 (H30):** data OFF → SMS → pin (real). **Go/no-go** for nice-to-haves |
| *sleep* | 2 × 3 h shifts: never everyone asleep at once; the person who just merged does not start new work |
| **30–36** P6 · P7 | witness mode, SOS, settings, battery/permissions edge cases | witness web page, crew page, `/phones`, `/demo`, rate limiting | measurements (latency ×10 per channel, false-alarm tests), threshold tuning with real drops | slides v1, demo script v1, record the **backup videos** of every step | **H36: FEATURE FREEZE** (bug fixes only) |
| **36–44** P7 · P8 | release APK ×2 phones, airplane-mode drill, battery optimisation off | deploy backup (Vercel+Supabase), seed, `reset-demo` | final numbers on slides, sources slide, Q&A drill (medical + technical) | rehearsals ×3 with the live system, timing 5:00 | **H40: full dress rehearsal on stage hardware** |
| **44–48** | charge everything, pack cables | freeze DB snapshot, offline fallback ready | print the Q&A sheet | final rehearsal | **Pitch** |

Stand-up every 4 hours, 5 minutes, standing: *what's merged, what's blocked, what gate are we on.* One person (D or C) owns the clock and says "no" to scope.

## 3. Definition of done per gate
- **G1:** `curl` the two canonical SMS texts → two incidents; a third message with a bad CRC → an *unparsed* report, visible; Realtime event received by a test client; `pnpm check` green.
- **G2:** a non-team member can run the hero flow on the dashboard in under 90 s without help.
- **G3/G4:** measured on the real phone, screen recorded; airplane mode with SMS only enabled still reaches the dashboard.
- **Freeze:** `main` tagged `demo-v1`; installed APK hash recorded; backup videos exist; no uncommitted changes.

## 4. Cut list (cut in this order when behind)
1. Crew page · 2. Hospital registry admin UI · 3. Witness *web* page (keep the in-app witness mode) · 4. Arabic TTS (use recorded audio) · 5. Sensor lab · 6. PMTiles (use online tiles for the demo only) · 7. Native SMS module (use the composer + "Simulate SMS", and *say so*) · 8. Realtime (poll every 2 s).
**Never cut:** the visible packet, the dashboard hero flow, the audit log, the honesty slide ("validated vs assumed"), the backup video.

## 5. Daily operating rules
- `main` is always demoable. Work on branches; merge when `pnpm check` is green; tag at every gate (`gate-H10` …).
- Keep a `DECISIONS.md` (one line per decision, with the hour) — it feeds the pitch's "what we chose and why".
- Every feature ships with its **failure state** (offline, denied, empty, SMS-only). Design owns the list.
- No new dependency after H30 without a team yes.
- Measure early: latency and false-alarm numbers need runs on real phones; do not leave them for H44.

## 6. Pre-event preparation (only what the rules allow — ask!)
Accounts (Supabase, Vercel, Figma with the right seat, Expo, OpenRouteService, GitHub), tooling check (`07` §5), Android SDK + JDK 17 + a successful dev build of an empty Expo app on both demo phones, OSRM extract built and tested, PMTiles extract for the demo region, gateway phone with SIM tested at the venue's operators, reading `05` end to end, rehearse the 90-second hero flow script on paper.

## 7. If you only have 24 hours
> **The team is in this case (2026-10-30). Use `docs/17-24H-PLAN.md`**: hour blocks, the cut list, sleep shifts and the pitch without interviews. It wins over the sketch below.

Gates compress by half: G0 H1 · G1 H5 · G2 H10 · G4 H15 · freeze H18 · rehearse H18–24. Cut items 1–6 from the start; replace the native SMS module by the composer + Simulate SMS unless Role A has done a Kotlin Expo module before.

## 8. Additions from the phone-first pass (2026-10-30)
Phone sensors are the main path (docs/13); OBD and the box are roadmap (docs/16). What that adds to the plan, in order of value:

| When | Who | Task | Evidence to keep |
|---|---|---|---|
| H0–H2 | A | On the **Realme 10 Pro+**: tests **T1** (sensor inventory: range, resolution) and **T3** (real sampling rate), 30 min. Set `rangeG` from T1; if the rate is under 50 Hz say so in the app | screenshots in `docs/field-notes/` |
| H2–H10 | A, C | Integrate `packages/detector` (README there). Feed `traces/*.csv` through the app's replay screen and compare with `manifest.json` | replay screenshots |
| H0–H36, in parallel | D (+ anyone) | **Design Thinking evidence:** five short conversations, a five-person test log, an iteration table (docs/15 §2). Nothing invented; “not yet validated” is allowed | one page per conversation, no names |
| H10–H30 | D | BMC slide (docs/14), roadmap slide (docs/16), sources slide, competitor table filled by *installing and trying* each app | slides |
| H30–H36 | A | Realme tests **T5, T6, T8, T10** (GPS lag, screen-off survival, hard negatives, airplane-mode drill) | CSV traces + decisions |
| H24+ (optional, 2–3 h) | B + A | Source selector `Phone | BOX (simulated)` on `/phones` (docs/16 §4). Cut it before the witness web page | screenshot |

Add to the **cut list** (§4): the simulated BOX selector goes right after the crew page; Sensor Lab (M9) stays cut-able, but T1 and T3 must have been run once.
