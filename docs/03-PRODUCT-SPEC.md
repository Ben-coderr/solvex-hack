# 03 — Product Spec: Sellekni (سلّكني) · codename NAJDA

> **One sentence:** Sellekni is a *complementary emergency data layer* for Algerian road crashes: a phone detects the crash (or a witness reports it in 5 taps), sends a tiny structured packet by internet **or plain SMS**, and the operations room instantly gets an explainable severity estimate, a merged picture, and a hospital recommendation, with a pre-alert to the hospital. **We never replace the 14/1021 call and never dispatch anything automatically: humans decide.**

## 1. Problem (SolveX 3.0 · Problem 1) and what we do about each step

| Chain step | Today (Algeria) | Sellekni feature |
|---|---|---|
| Detection | Someone must notice and decide to call; solo/night/rural crashes found late | M3 crash detection · M6 witness mode · M7 SOS |
| Alert | Location described by voice (operators ask for the exact address); calls drop | M5 packet with exact coordinates + Plus Code, internet **or SMS** |
| Dispatch | Unstructured information; duplicate calls | D1 map, D6 merge duplicates, D2 structured picture |
| Assessment | No pre-arrival severity | D2 NSI band + confidence + reasons |
| Hospital choice | Nearest by habit; secondary transfers | D3 capability × ETA × status ranking |
| Hand-off | Hospital learns on arrival | D5 pre-alert (web or SMS) + ACK |

**Hard constraints:** complementary (keep the voice call) · decision support only · works when data fails (SMS) · no dependence on hospital IT · Arabic/French · free tools only · Android-first.

## 2. Personas

| Persona | Moment | Needs | Sellekni surface |
|---|---|---|---|
| **Karim**, solo driver, RN road, night | Crash; may be unconscious | Help sent *for* him; no typing | Mobile auto-detection |
| **Samia**, witness in a passing car | Sees a crash | Know what to say, report in seconds, without an account | Witness mode or `/w/[id]` |
| **Nadir**, Protection civile operator | 20 calls an hour | One screen, trustworthy, no clutter, can override | Dispatcher dashboard |
| **Dr. Amel**, ED charge physician | 10 min before arrival | ETA, mechanism, suspected injuries, ack in one tap | Hospital view / pre-alert SMS |
| **Youcef**, ambulance paramedic | In transit | Enter vitals in 20 s with gloves | Crew page |
| **The jury** | 5 minutes | Understand, believe, remember | Demo + pitch |

## 3. Functionality (IDs are referenced by the phase prompts)

Priority: **P0** = must be in the demo · **P1** = if ahead at the H30 gate · **P2** = roadmap/stretch.

### 3.1 Mobile app (Expo, Android-first)

| ID | Feature | Pri | Acceptance criteria (Given / When / Then) |
|---|---|---|---|
| M1 | Onboarding + consent + permissions | P0 | Given first launch, when the user finishes onboarding, then they have chosen a language (ar/fr/en), read a 3-screen explainer (detects crashes · shares location · sends SMS), granted location + SMS + notification permissions (each with a rationale), and optionally set the SIM. Denying SMS shows the degraded mode ("HTTPS and the SMS composer only"), not a dead end |
| M2 | Drive mode | P0 | When Drive mode is on, a persistent notification shows; the screen stays awake; a status ring shows IDLE/ARMED; speed, GPS accuracy, battery and connectivity (data / SMS-only / none) are visible; one tap stops it |
| M3 | Crash detector + **replay engine** | P0 | The pure detector produces the same decisions live and from CSV traces. Reference implementation: `packages/detector` (docs/13); do not re-implement it. Traces: `frontal_45` and `rollover_71` alert; `speed_bump`, `hard_brake`, `phone_drop`, `pothole_80`, `pothole_then_stop`, `door_slam`, `walking_pocket` and `fender_bender_12` must not. A replay is visibly labelled **REPLAY · SYNTHETIC** |
| M4 | Countdown | P0 | After CONFIRM, a full-screen countdown (30 s; 10 s in demo mode, labelled) with alarm, vibration and AR/FR voice. Two controls only: "I'm OK" (≥72 dp) and "Send help now". No response → alert with flag `N` |
| M5 | Alert + status | P0 | Packet is built (`@najda/shared`), persisted in the outbox, the dialler opens on 14, and the fallback chain runs. The status screen shows each channel (HTTPS / SMS / retry) and, on ACK, "Received by rescuers" + time. Works with data off |
| M6 | Witness mode | P0 | 5 taps (vehicles → who is hurt → danger → location confirm → send) with pictograms; no account; GPS auto; produces an `SW` packet. Includes "secure the scene, don't move the victim" |
| M7 | SOS | P0 | Long-press (1.5 s) anywhere on the home screen sends a manual `SM` alert |
| M8 | Settings | P0 | Language, SIM, gateway numbers (GW1/GW2), emergency contacts, demo mode, countdown length (demo only), sensor lab |
| M9 | Sensor lab (record/export CSV) | P1 | Record 60 s of accel/gyro/GPS to CSV on the phone to calibrate thresholds and build replay traces. Run tests T1 (sensor inventory) and T3 (real sampling rate) on the Realme first: `rangeG` and the 45 Hz floor depend on them (plan T1–T10 in docs/13 §6.3; same CSV format as `packages/detector/traces`) |
| M10 | Medical profile (blood group, allergies, anticoagulants), on-device, consented | P2 | Never sent by SMS; sent over HTTPS only with explicit consent |
| M11 | Background sensing service (Kotlin foreground service) | P2 | Detection with the screen off |
| M12 | Incoming "SLK ACK" SMS receiver | P2 | ACK for the SMS-only path |

### 3.2 Web (Next.js)

| ID | Feature | Pri | Acceptance criteria |
|---|---|---|---|
| D1 | Live map + incident queue | P0 | New incidents appear < 2 s after ingest without refresh, as `TriageMarker` pins; queue sorted by band then age; each row shows channel icon (🌐/✉️ drawn as icons), age timer, "AUTO · UNCONFIRMED" badge, duplicate count. Works offline with PMTiles |
| D2 | Incident detail | P0 | Shows packet as `PacketChip`s, the raw SMS text, NSI band + score + **confidence + top-3 reasons + disclaimer**, resource hints (extrication / fire / MCI), report timeline, call-back `tel:` link, Plus Code, coordinates copy button |
| D3 | Orientation panel | P0 | Top-3 hospitals with ETA, route drawn on the map, missing capabilities, status + age, plain-language explanation; `nearestEd` always visible; override of band or hospital **requires a reason** |
| D4 | Lifecycle bar | P0 | `RECEIVED → ACKNOWLEDGED → DISPATCHED → EN_ROUTE → ON_SCENE → TRANSPORTING → AT_HOSPITAL → CLOSED`, plus `CANCELLED (false alarm)` and `MERGED`. Every transition is a human click with actor + timestamp in the audit log |
| D5 | Pre-alert + ACK | P0 | One click sends a web card and an SMS to the chosen hospital; the dispatcher sees ✓ when the hospital ACKs; if no ACK in 2 min a warning appears |
| D6 | Paste SMS / Simulate SMS | P0 | Paste any received `SLK1…` text → same ingest path. A parse failure still creates a visible "unparsed report" |
| D7 | Audit log | P0 | Every automated suggestion and every human decision (who, what, before/after, reason, when); filterable by incident |
| D8 | Hospital ED view | P0 | Incoming patients with ETA countdown, band, mechanism, vitals, reasons; **ACK** button; status toggle OK/BUSY/SATURATED (expires after 6 h) |
| D9 | Crew page `/crew/[id]` | P1 | GCS, SBP, SpO₂, HR, ETA; submit → re-score; physiology can upgrade to R and notifies the dispatcher and the hospital |
| D10 | Witness page `/w/[id]?k=…` | P1 | 4 fields, works on old Android browsers, unguessable token in the link, rate-limited; shows only a coarse location (~100 m) and no victim data; its report merges into the incident (confidence M → H) |
| D11 | `/phones` + `/demo` | P0 | Virtual driver/witness/crew/hospital phones; scenario buttons; reset; QR to the witness page; a visible stopwatch for measuring |
| D12 | Hospital registry admin | P1 | Edit capabilities/level/phone, `verified` flag, CSV import |
| D13 | Metrics export | P1 | CSV of report timestamps per channel for the pitch numbers (median/p90) |
| D14 | SMS status updates (`SLK STATUS CHU-A SAT`) | P1 | Inbound SMS from a known hospital number updates its status |

## 4. Core user flows

**A. Automatic detection, internet down (the hero flow).** Karim's phone is in Drive mode at 71 km/h → impact + rollover → CONFIRM (stopped) → countdown → no response → packet `R75H…` → outbox → dialler opens on 14 → HTTPS fails → SMS sent to GW1 → gateway phone receives → webhook → ingest: decode, recompute, store, merge-check → Realtime push → dashboard pin appears in < 2 s (data path) → ACK SMS returns → Karim's phone shows "Received by rescuers".

**B. Witness.** Samia opens the app (or scans the QR to `/w/[id]`) → 5 taps → `SW` packet → server merges into the existing incident within 300 m / 10 min → confidence M → H, resource hint "extrication".

**C. Dispatcher.** Nadir sees the pin → opens detail → reads reasons + confidence → calls back (`tel:`) → ACKNOWLEDGED → opens Orientation → picks CHU-A (or overrides with a reason) → DISPATCHED (unit id) → Pre-alert → watches ✓ ACK → advances the lifecycle → CLOSED.

**D. Hospital.** Dr. Amel's screen (or phone) receives the pre-alert → ETA countdown → ACK → sets status SATURATED when full.

**E. Crew.** Youcef opens `/crew/[id]` from the SMS link → enters GCS 9, SBP 85 → submit → band upgrades to R if not already, dispatcher and hospital notified.

## 5. Screens (what to design in Figma — see `06-DESIGN-AND-UX.md`)

**Mobile (12):** Welcome/language · Explainer ×3 · Permissions · Home (Drive mode toggle, big status ring, SOS, Witness, last alert) · Drive mode live · **Countdown** · **Alert status** (channels, ACK, dial buttons, "what to say" card) · Witness steps 1–5 · Witness sent · Settings · Replay picker (demo) · Sensor lab.
**Web (9):** Dispatcher home (map+queue) · Incident detail drawer · Orientation panel · Lifecycle bar states · Hospital ED view · Crew form · Witness page · `/phones` · `/demo`.
**Every screen:** loading, empty, error, offline and "SMS-only" variants; light + dark; ar (RTL) + fr + en.

## 6. Edge cases the app must handle (write tests/mocks for each)
- Phone dropped / speed bump / hard brake → no alert (speed gate + multi-signal rule).
- GPS fix absent at impact → send last known fix + `acc` flag; if none, still send the alert (coordinates required by the SMS format: use last known; the dispatcher sees "location age: N min").
- Permission revoked mid-drive → banner + degrade, never crash.
- SMS sent but no ACK → retry with backoff; stop after 30 min and say so.
- Two phones in the same crashed car → both alert → merged (same place/time), confidence H.
- Dual SIM with no default SMS SIM → ask once, remember.
- Arabic TTS data missing → fall back to the recorded audio.
- Battery < 10% → reduce sampling, keep detection.
- Duplicate delivery of one SMS → idempotent (same id + same body = same report).
- Garbage / forged SMS → stored as unparsed, never auto-dispatched, rate-limited per sender.

## 7. Non-functional targets (ASSUMPTIONS to measure, not claims)
- Alert-to-dashboard: **measure** median/p90 by channel (HTTPS vs SMS) over ≥ 10 runs each.
- False alerts: **0 in N** staged tests (30 drops, 20 hard brakes, 20 speed bumps, 10 min walking). Report N.
- Witness report in ≤ 15 s median for 5 first-time users.
- Dashboard remains usable on a 1366×768 projector at 5 m reading distance (min 18 px data text).
- Accessibility: WCAG 2.2 AA contrast (enforced by token tests), 48 dp targets, screen-reader labels, reduced-motion.

## 8. Out of scope (say it in the pitch as roadmap)
No LLM, no ML training, no citizen accounts, no payments, no EMR/HMIS integration, no live bed counts, no iOS silent SMS, no real-time ambulance GPS, no operator short code (gateway phone stands in), no automatic dispatch.
