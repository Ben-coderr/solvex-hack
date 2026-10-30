# 11 — Corrections, Risks, Assumptions

> Read this before you reuse anything from the earlier plan (`PLAN_V3.md` and the English research set 00–09). Those files were useful for ideas; the items below are the places where they would have hurt you in front of a jury or in the code.
> Severity: **🔴 would break the build or the credibility** · **🟠 wrong but recoverable** · **🟡 polish**.

> **Later corrections (2026-10-30)** are in docs/12 (rename, sensor range, OBD/IoT verdicts), docs/13 §4.1 (detector), docs/14 §1 and docs/15 §4 (unsourced numbers, unconfirmed jury criteria, corrected Q&A).

## A. Corrections to the earlier documents

| # | Sev | Where | Problem | What this pack does |
|---|---|---|---|---|
| 1 | 🔴 | V3 §3.2–3.3 | `expo-sms` is listed as the way to "send SMS natively, no 4G". It **only opens the SMS composer**; the user must tap Send. It cannot send silently | Local Kotlin Expo module over `SmsManager`; composer is the fallback. `SEND_SMS` is Play-restricted → sideload; iOS impossible |
| 2 | 🔴 | V3 §3.1/§3.2 | Accelerometer polling "in the background" via `expo-sensors`: it stops when the app is backgrounded | Foreground "Drive mode" + keep-awake + location foreground service; replay mode for the demo; Kotlin service = stretch |
| 3 | 🔴 | V3 §5 vs 06 §6 | **Two incompatible packet formats.** V3's example `NAJDA1 A7K3F2 1423 3630N00308E R H RO 085094 8FVC9G2P #3A` has no verified CRC, a 6-char id, French band letters (R/O/J/V/N), and coordinates too coarse to locate a car | One format (06's tokens), implemented, 5,000-packet property tested, CRC verified by an independent implementation | <!-- keep-magic: historical quote of the old plan, do not rewrite -->
| 4 | 🔴 | V3 §16, §11 | Witness page `/w/<id>` "shows GPS coordinates, accident type, victim state" to anyone with the link. A 5-char id is guessable; that exposes where an injured person is | Link carries an unguessable token; page shows only a coarse location (~100 m), no victim data; rate-limited |
| 5 | 🟠 | V3 §6.1 | NSI examples: raw 90 → "78" is **77**; raw 150 → "92" is **91**; "range 1–99, never 0" is false (raw 0 → 0). Test vector `scoring-001` says raw 110 → 84; it is **83** | Fixed and pinned by tests (`scoreFromRaw`) |
| 6 | 🟠 | V3 §6.3 | Vittel code contradicts its own table and vector: it *raises* every band to O when mechanism = H (table says "mech L + normal vitals → green/yellow"); the vector claims R→O capping that the code never performs; **HR > 130 is treated as a Vittel criterion**, but to our knowledge the classic Vittel physiological criteria are GCS < 13, SBP < 90, SpO₂ < 90 | Clean rule: physiology can force R, mechanism-only is capped at O, HR is only a "shock proxy" (15 points, counts as physiological evidence). **Have a clinician confirm** before presenting it as "Vittel" — we say "Vittel-style" |
| 7 | 🟠 | 06 §8 | Hospital worked example: EPH-B scores **0.77, not 0.71** (T 0.85, C 0.6, L 1.0, A 0.5). With the printed formula EPH-B would outrank CHU-A; CHU-A wins only because of the C ≥ 0.75 gate | Corrected, tested, and explained honestly (docs/05 §5.1). Added `nearestEd` |
| 8 | 🟠 | V3 §8 | Hospital ranking depends on "lits trauma disponibles" (live bed counts). No such data exists in Algeria | Capability table + optional status with 6 h decay + "unknown shown as unknown" |
| 9 | 🟠 | V3 §4, §12 | OBD-II: "PID 0x00A vehicle speed" (speed is `0x0D`); `0x4F` is not acceleration; "speed in miles/h" bug (OBD speed is km/h); an airbag deployment DTC (B0001) is **not readable by a generic ELM327** in the emissions diagnostic mode (SRS modules need manufacturer-specific sessions); the ELM327 clone ecosystem is flaky | Cut from MVP (YAGNI); roadmap item with those caveats |
| 10 | 🟠 | V3 §1.1, §15 | Unsourced statistics presented as facts: "18 min average delay", "<10 min golden window (WHO)", "~50,000 serious injuries/yr", "72% urban 4G", "~95% SMS coverage", "<30% ambulances with GPS", "<2% false positives", "50 scenarios across 69 wilayas", "5 DZD per incident", "200,000 DZD/month" | Removed. Only the sourced list in `10-PITCH-DEMO-QA.md` §4 may be stated |
| 11 | 🟠 | V3 §1.3 | "composer le 021": Protection civile is **14 / 1021**; Police 17 / 1548; Gendarmerie 1055. A national SAMU number (115/16) is **unconfirmed** | Numbers fixed; SAMU number not shown anywhere |
| 12 | 🟠 | V3 §7.1 | "48 historical wilayas + 21 created in 2019 = 69" does not match the sources (69 wilayas per the 2026 official journal; history differs) | State only "69 wilayas"; don't narrate the history |
| 13 | 🟠 | V3 §2 | Twilio as the SMS gateway: inbound Algerian numbers unverified, costs money | Gateway Android phone (capcom6) + Paste/Simulate fallbacks |
| 14 | 🟠 | V3 §15.5 | "SMS toujours livré": SMS has no delivery guarantee | Delivery reports, ACKs, retries; the UI shows each channel's state |
| 15 | 🟠 | V3 §15.5 Q3 | Privacy answer claims SMS data is "encrypted server-side (HTTPS)" and "nothing stored on the phone". GSM SMS is not end-to-end encrypted; the outbox is stored on the phone | Honest wording: SMS carries only non-sensitive essentials; the medical profile never uses SMS; local outbox is cleared after ACK/30 min |
| 16 | 🟠 | V3 §15 | "AI triage / IA" wording | It is a transparent rules engine: say "rules" |
| 17 | 🟠 | V3 Q7 | Claims data from the "registre MSP" and 50 scenarios tested | Not done; say what is curated/illustrative |
| 18 | 🟡 | 06 §6.2 | "≥ 69 spare characters" is true for a typical auto packet (91 chars) but the worst case is 113 (47 spare) | Both numbers documented |
| 19 | 🟡 | V3 §14 | Mobile only starts at H28 — the riskiest part (native SMS, sensors) comes last | Mobile starts at H0, native SMS has its own gate (G4, H30) |
| 20 | 🟡 | 06 §3.3 | Flutter plan | Superseded (Expo + Next.js as requested) |
| 21 | 🔴 | docs 03–05, 10 (this pack) | **Our own error:** the docs treat a phone as measuring crash peaks like 38 g. Phone accelerometers saturate (typically ±8–16 g, device-specific; Apple needed a 256 g sensor for iPhone 14 Crash Detection) | Detector is range-aware, traces clipped, `G = min(peak, range)`, demo says "sensor ceiling"; high-g only for a hardware box (docs/12 §3) |

## B. Risk register

| # | Risk | L | I | Early signal | Mitigation / fallback |
|---|---|---|---|---|---|
| R1 | Native SMS module fails (permissions, OEM restrictions, dual-SIM) | M | **H** | by H26 no SMS leaves a real phone | spike it first on both phones; composer + Simulate SMS fallback, say so in the demo |
| R2 | SMS slow or lost at the venue | M | **H** | latency test at the venue the day before | pick the strongest operator SIM for the gateway; local gateway mode; Simulate SMS; recorded run |
| R3 | Sensing unreliable in background / OEM battery killers | **H** | M | detection stops when the screen locks | Drive mode foreground, whitelist battery, replay mode on stage |
| R4 | Venue network down | M | **H** | — | local-first stack; own hotspot; PMTiles; recorded run |
| R5 | OSRM build too heavy | M | M | extract fails / OOM | demo-region extract only; ORS; haversine |
| R6 | Supabase Free project paused / quota | L | **H** | project shows "paused" | wake it D−1; local stack is primary |
| R7 | Jury attacks medical validity | **H** | M | — | "Validated vs assumed" slide; Vittel-*style* wording; clinician review is the pilot's step 1 |
| R8 | **Rule on pre-written code / AI tools** | ? | **H** | unanswered by organisers | ask in advance; disclose the starter pack; build the product during the event |
| R9 | Scope creep | **H** | **H** | work started that isn't in the gate list | owner of the clock says no; cut list in `09` |
| R10 | Figma seat/limits block the design flow | M | M | MCP calls refused or capped | Path C (token-first); never block the build on Figma |
| R11 | Prompt injection through tool output (witness text in DB → agent) | L | M | agent proposes odd actions after reading rows | read-only MCP, project-scoped, review writes, treat rows as data |
| R12 | Legal/ethical: impersonating authorities, protected emblems | L | **H** | logo drafts with crescents/crosses or official marks | original mark; "prototype, not an official service" footer; no Protection civile / ministry logos |
| R13 | False reassurance (green band) or over-reliance | L | **H** | — | band G only with an explicit "I'm OK"/witness confirmation; U otherwise; always "confirm by call-back" |
| R14 | Forged SMS (CRC is not authentication) | M | M | unexpected incidents | secret gateway number, rate limits, unconfirmed badge, human dispatch only |
| R15 | NativeWind/Reanimated version friction | M | L | styling breaks after install | 30-minute rule → `StyleSheet` + tokens |
| R16 | Arabic TTS missing/poor on the demo phone | M | L | no Arabic voice | pre-recorded audio files |
| R17 | Team fatigue → sloppy merges at H40+ | **H** | M | red `main` | tags at gates, sleep shifts, no new features after H36 |
| R18 | Location privacy of victims (witness page, logs) | M | **H** | public pages show exact coordinates | coarse location, tokens, retention limits, no PII in logs |

## C. Assumptions register (say "assumption" out loud)
Duration 48 h · team of 4 · Android-only demo phones · judging criteria · every threshold in the detector (4 g, 8 g, 25 km/h gate, 20 km/h drop, 90° rollover, 30 s countdown) · NSI points, 70/45/20 cut-offs, confidence rules · GCS/SBP point values · hospital weights 0.45/0.35/0.15/0.05, the 60-min Level-A gate, the 0.75 capability gate, the 6 h status decay · merge rule 300 m / 10 min · DZ-MSD is our own spec · SMS gateway webhook field names · "no routine hospital pre-alert protocol exists" (absence of evidence) · business model · any "minutes saved" figure (a hypothesis for the pilot to measure).

## D. Legal and ethical checklist (Algeria, hackathon prototype)
- **Data:** Law 18-07 (as amended by Law 25-11, 2025): health data is sensitive; vital-interest basis for alerts; explicit consent for any medical profile; transfers abroad need ANPDP authorisation; DPO + processing register; breach notice within 5 days. Hackathon = **synthetic data only**; say it.
- **Telecom/SMS:** sending SMS from an app needs `SEND_SMS`; Play Store restricts it → sideload for the demo. Short codes need operator agreements: production, not hackathon.
- **Emblems and names:** don't use the Red Crescent/Red Cross emblem, Protection civile/DGSN/Gendarmerie/ministry logos, or imply endorsement. Footer: "Hackathon prototype — not an official emergency service. Always call 14 / 1021 / 1055 / 17."
- **Consent and transparency:** onboarding explains detection, location and SMS; microphone is **off** (no audio is recorded); the app never auto-places a call.
- **Medical wording:** "estimated risk", never diagnosis; disclaimer on every severity display; all overrides carry a reason.
- **Open data licences:** OSM data is ODbL (attribute); VZCrash (if you get it) is CC BY-NC research data: ask the organisers whether a non-commercial dataset is allowed in a prototype.

## E. Questions for the organisers (add to your own list)
1. May we use **pre-existing open-source libraries, AI coding tools and a prepared tested package** (disclosed), as long as the product is built during the event? What exactly is forbidden? 2. Official judging criteria and weights, pitch and Q&A length, live demo vs video. 3. Is sending/receiving **real SMS** allowed in the room; is mobile coverage reliable; is the Wi-Fi stable; may we use our hotspot? 4. Are **sideloaded APKs** acceptable? 5. Do you provide hospital lists, DNSR/Gendarmerie/Protection civile data, mentors from Protection civile/SAMU/an ED? 6. Confirm the emergency numbers and whether a national SAMU number exists. 7. Is **simulated** integration acceptable? 8. Constraints on foreign cloud hosting/AI services? 9. Follow-up programme for winners? (The full list is in `09-questions-for-organizers.md` of your research set.)

## F. What this pack verified, and what it could not
**Verified by running code in a sandbox:** the codec, CRC, GSM-7 check, Plus Codes (vs Google's library), scoring, ranking, merge (67 tests); the golden vectors against an independent Python implementation; WCAG contrast of every token pair; a fresh `pnpm install && pnpm check`; the Claude Code test-on-edit hook (including a deliberately broken weight being caught).
**Verified against vendor docs (2026-10-30):** the Figma, shadcn and Supabase MCP setup commands; Figma's seat requirement for canvas writes; the EAS free plan wording ("limited quantity of low-priority builds"); the free-tier limits in `08`.
**Not verified (your first tasks):** the SQL migration (run `supabase db reset`); the Kotlin module and everything Android-side; the SMS gateway's webhook payload; Expo SDK 58 + NativeWind + Reanimated 4 compatibility; Figma MCP call limits for your plan; OSRM/PMTiles build sizes and timings for your region; Arabic TTS on your phones; all medical content (clinician review).
