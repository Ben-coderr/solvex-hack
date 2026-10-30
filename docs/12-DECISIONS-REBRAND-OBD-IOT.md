# 12 — Decisions: rebrand to Sellekni, the OBD add-on, the IoT box (2026-10-30)

> **Read this first — what this memo is and is not.**
> I could **not** open the two GitHub repos (`3imss/obd-connected-pack`, the team's earlier repo → `docs/solvex`): GitHub is not linked to the session that produced this pack, and nothing could be fetched from either repo (they may be private). So **§7 is a review protocol, not findings.** Everything else here is evidence-backed (sources in §9) or explicitly marked *assumption*. Where I reason about "your OBD pack" or "your IoT docs", I am reasoning from the **old plan's known errors** (docs/11 §A) and from first principles, and I say so.

## 1. Decisions at a glance

| # | Decision | Why (short) | Cost |
|---|---|---|---|
| 1 | Brand = **Sellekni**. Keep the old name as the **internal codename** (code, env, repo) — *superseded at 24h-H5: one name everywhere* | renaming internals buys nothing and risks the tested contract | 0 |
| 2 | Change the **wire magic** (original 6 chars) → `SLK1` **now**, with `scripts/rename-magic.mjs` | the packet is on the projector and on the gateway phone's screen; the cost grows after P5 fixtures and the pitch deck exist | ~15 min |
| 3 | Decide the **Android package id / URL scheme** before building APKs for the phones | changing it later = a different app (reinstall, permissions, battery whitelist) | 10 min |
| 4 | Fix the **logo** before it ships (§2.3): remove the red cross, separate icon-mark vs wordmark, mono variant, vector | emblem misuse risk; red = triage red; 32 px legibility | 2–3 h (designer) |
| 5 | **New finding (affects P4 today):** phone accelerometers saturate at ±8–16 g → make the detector **range-aware**, clip replay traces, never show "38 g measured by the phone" | §3 | 1–2 h |
| 6 | **OBD add-on:** NO-GO for the 48 h build. It gives vehicle speed, **not** airbag status. Keep as roadmap | §4 | 0 |
| 7 | **IoT box:** roadmap + a clearly labelled **simulated** `BOX` replay; build real hardware only if the GO criteria in §5.3 are all true | §5 | 0–3 h (sim) |
| 8 | **Best next step** (§8): name freeze → range-aware detector → finish P5 (native SMS, gates G3/G4) → *then* review the two repos with the §7 rubric | protects the differentiator | — |

---

## 2. Rebrand: Sellekni

### 2.1 Where the brand lives, and what to do

| Place | Today | Action | When |
|---|---|---|---|
| UI strings, app display name, splash | old name | one `brand` constants module + i18n keys (no literals in components); `app.json` `name` | now |
| Arabic wordmark | old wordmark | **needs the intended Arabic spelling** (see questions in the reply) — RTL screens need it | now |
| Android `package`, iOS `bundleIdentifier`, URL `scheme` | from P0 scaffolding (old codename) | set e.g. `com.sellekni.app` / `sellekni` **before** the first APK for the phones | now |
| **Wire magic** | original 6-char magic | `node scripts/rename-magic.mjs SLK1 --write` (§2.2) | before P5 fixtures |
| Pre-alert SMS template | old-name `PRE-ALERTE …` | `SELLEKNI PRE-ALERTE …` (GSM-7 safe, no accents) — build it from the brand constant | with P3/P6 |
| ACK / status SMS | old-name `ACK`, `NJ STATUS CHU-A SAT` | pick short, brand-consistent verbs (e.g. `SLK ACK`, `SLK STATUS …`) — one constant | with P5/P6 |
| API-key header, env var names, package scope, repo name, skill names | internal | **keep** (codename); rename later if the product continues — *done at 24h-H5* | — |
| Pitch deck, README, store listing | old name | replace | P8 |
| Design tokens | brand blue `#2B62F0` | see §2.3 finding 2 | after the logo decision |

### 2.2 The wire-magic rename (tested)
The CRC-8 covers the magic, so every literal full packet in tests, docs, fixtures and app code becomes invalid when the magic changes. Replacing text by hand breaks the contract silently. `scripts/rename-magic.mjs` follows the `sellekni-protocol` procedure automatically.

```bash
git switch -c chore/rename-magic          # clean branch first
node scripts/rename-magic.mjs SLK1        # DRY RUN: lists the files it would touch
node scripts/rename-magic.mjs SLK1 --write   # applies, runs `pnpm vectors`, then `pnpm check`
git diff                                  # review, especially test-vectors/ and docs/05
```

What it does: rewrites the magic in `dzmsd.ts`, `crosscheck.py`, `generate-vectors.ts`, tests and any text file in the repo (apps included); **recomputes the CRC of every literal packet**; moves the quoted lengths (`93 chars`, `(67 spare)`, `WIRE1.length`) by the length delta; skips lines containing `keep-magic` (historical quotes); regenerates the golden vectors; runs `pnpm check`.
**Tested here** on a copy of the pack: original magic → `SLK1` and then `SLK1 → SELK1`; both ended with 67/67 shared tests, 6/6 token tests, 302 valid + 134 invalid vectors, 405 NSI cases and the independent Python decoder agreeing.
**Limits:** it only sees text files; a packet literal split across lines or built by string concatenation will not be recomputed (the final `pnpm check` and your app tests will fail loudly, which is the point). Run it on a clean branch; do not run it after the venue fixtures are recorded without re-recording them.

| Magic | Typical auto packet | Worst case | Verdict |
|---|---|---|---|
| original 6-char magic | 93 | 115 | works; brand mismatch on screen |
| **`SLK1`** | **91** | **113** | **recommended: short, legible, GSM-7 safe** |
| `SELK1` | 92 | 114 | ok |
| `SELLEKNI1` | 96 | 118 | most on-brand; costs +3 chars (limit 160, so still fine) |

*(Numbers for the original magic, `SLK1` and `SELK1` come from the tested runs; `SELLEKNI1` is computed as +3 over the original.)*

### 2.3 Logo review (measured on the image you sent)

| # | Finding | Evidence | Fix |
|---|---|---|---|
| 1 | 🔴 **Red cross on the ambulance** | ICRC: use of the emblem *or imitations* "for commercial or pseudo-medical purposes is prohibited"; states must repress misuse. A red cross on a white ground is the emblem. Algeria's society uses the Red Crescent. Our own rule (`sellekni-design`) bans it. *I'm not a lawyer.* | Remove the cross. Neutral options: plain pulse line, a non-red "+" only if a lawyer says so, or drop the ambulance |
| 2 | 🔴 **Logo red ≈ triage red** | Sampled red: `#F41F3D / #FB2E45 / #F22F43`. Our reserved triage R is `#E5484D`. RGB distance 30–47 (out of ~441): visually the same. The logo's *pin* is also the shape of our map markers | Product UI uses a **mono (white/ink) logo**; full-colour only on splash, store icon, pitch. Keep `brand` out of red. Never put the red logo next to the triage legend |
| 3 | 🟠 White text on the logo red fails AA for normal text | contrast 3.76–4.11:1 (needs 4.5:1; large text 3:1) | no red buttons with white labels; red on black is fine (5.1–5.6:1) |
| 4 | 🟠 **Illegible at small sizes** | I downscaled to 64 and 32 px: the road and ambulance merge into a blob; only the pin survives; the wordmark is unreadable at ≤64 px | Separate **icon mark** (pin + S-road, flat, 2 colours, no speed lines/glow) from the **wordmark lockup**. Min sizes: mark 24 px, lockup 96 px wide |
| 5 | 🟠 Raster with glow/soft gradients (reads as AI-rendered) | the image itself | Redraw as **vector** (Figma). Also safer for trademark: purely AI-generated artwork may not be protectable — have a human redraw it if the brand will outlive the hackathon *(assumption; check with a professional)* |
| 6 | 🟡 The ambulance implies we dispatch vehicles | our principle: complementary, humans dispatch | Either replace with a phone/signal motif, or keep it and say in the pitch "we route information, not vehicles" |
| 7 | 🟡 Wordmark `sellekni` in a geometric sans: `l l` vs `I` ambiguity; the red dot on the `i` is the nicest idea in the logo | visual | keep the dot; test an Arabic lockup |
| 8 | 🟡 Name collision not checked | my web search for `Sellekni`/`سلكني` was shallow and found nothing relevant | check Play Store, Instagram, the `.dz` domain and **INAPI** (the Algerian trademark office) before printing anything |

**Assets to produce (D):** `logo-full.svg`, `logo-mark.svg`, `logo-mono.svg` (white), `logo-ar.svg`; Android adaptive-icon foreground (1024², keep the mark inside the central ~60%); splash; **notification small icon = white silhouette on transparent** (Android renders it as a mask; this is the icon of the Drive-mode foreground-service notification — verify the exact Expo config in the docs).

---

## 3. New finding that affects P4 today: phone accelerometers saturate

**Evidence.** A smartphone MEMS accelerometer (Bosch BMI160 in one published drop test) is limited to **±16 g**; a table drop that produced **87 g** on a reference sensor "could not be resolved" by the phone. Android's `Sensor.getMaximumRange()` is **device-specific** (one developer reports 156.96 m/s² ≈ 16 g with readings capping near 2 g on his phone — anecdotal). Apple needed a **new high-g sensor (up to 256 g)** for iPhone 14 Crash Detection. A telematics vendor lists phone drops at 50–200 g, speed bumps/potholes 3–8 g, hard braking 3–6 g *(vendor blog, not peer-reviewed)*.

**What this breaks in our own docs** (my error, not the old plan's):

| Our assumption (docs 03–05, 10) | Reality | Change |
|---|---|---|
| A phone "measures 38 g" (`G38` in the canonical packet, demo step 2) | A phone reports at most its range (≈8–16 g) | Replay traces for **phone** sources are **clipped to the range**; the demo says "sensor ceiling"; `G38` stays only as a *protocol* example and as what a high-g **box** could send |
| Rule (b): `peak ≥ 8 g` | On a ±8 g phone, 8 g *is* saturation | Express peak rules as `min(threshold, 0.95 × range)` and add "time at saturation ≥ N ms" |
| NSI `peak ≥ 20 g → +5` | Unreachable from a phone | Harmless (5 of ~100 points; Δv dominates). Keep for hardware sources; never display it for phone alerts |
| Detector gates | Vendor practice adds a **multi-axis gate** (≥2 axes with significant force) and a **post-event gate** (still at highway speed after the spike → reject) | We already confirm by "stopped within 5 s" (post-event). **Add the multi-axis gate** — *superseded: docs/13 §4.1 demoted it to a reported cue; the built gates are speed history, high-g duration, speed collapse and the stop* |
| Sampling | A 30 ms duration gate needs ≥ ~100 Hz | Sensor Lab (M9) must print the **actual** rate and range of each demo phone |

**P4 actions:** read the accelerometer's max range (Kotlin module `getAccelerometerRange()` — one more reason the native module exists — or calibrate with a recorded drop in Sensor Lab); mark samples `|a| ≥ 0.95·range` as saturated; `G = min(peak, range)` in the packet and tell the user "≥ 16 g (sensor limit)" in reasons; regenerate the five traces clipped; add the multi-axis gate and a test (single-axis spike with no speed history must not alert); keep determinism. *Superseded: all of this is built in `packages/detector` (docs/13 §3, §4.1); integrate it, do not rewrite it.*

**Why this matters beyond P4:** it is the strongest *technical* argument for a hardware sensor (§5): a purpose-built ±200 g IMU can see the real crash pulse; a phone cannot.

---

## 4. The OBD add-on

### 4.1 What OBD-II can and cannot give (verified)
- Mode 01 live data includes **vehicle speed = PID 0D** (1 byte, 0–255 km/h, 1 km/h steps) and **RPM = PID 0C**. (Docs/11 row 9: the old plan said "PID 0x00A" and "mi/h" — wrong.)
- **No standard PID or DTC for airbag/SRS status.** OBD-II exists "primarily for state-mandated emissions inspections"; "most PIDs in use are non-standard", with public information "very limited" and OEM documentation paywalled. So **"airbag deployed" is a vehicle-specific signal** that a generic dongle cannot read. *Do not claim it.*
- **ELM327** adapters: widely cloned from v1.4 firmware with known bugs; the original vendor announced closure (June 2022). Expect flaky dongles.
- **Coverage:** EOBD mandatory for EU petrol cars from 2001 and diesel from 2004 (US: 1996). Heavy vehicles use J1939; motorcycles generally have no OBD-II port *(my knowledge)*. **Algeria's fleet mix is unknown to me** — get the number from ONS/the organisers before claiming coverage.
- **Pin 16 is permanent +12 V** → the dongle is always powered (parasitic drain; needs sleep logic).
- **Bluetooth:** `react-native-ble-plx` is **BLE only** (no Classic); it needs the dev build (we have one). Many cheap ELM327 dongles are **Classic SPP** *(my knowledge — check yours by scanning for it in a BLE scanner)*; Classic on Android needs a different library and is impossible on iOS.
- **Business reality:** Automatic (OBD adapter with crash alerts, $2–5/month plans) **shut down on 28 May 2020**.

### 4.2 Critique of "OBD as a crash-detection source"
| Signal | Value to Sellekni | Verdict |
|---|---|---|
| Wheel-speed at 5–10 Hz *(polling rate over a clone dongle is **unmeasured**; the sources give no throughput)* | Sharper Δv than 1 Hz GPS — but our NSI weights Δv in coarse steps (≥25/40/60 km/h) and thresholds are assumptions | modest gain |
| Airbag deployed | not generic | **cannot be claimed** |
| Loss of OBD link / ECU silent | weak, ambiguous (dongle unplugged ≠ crash) | skip |
| VIN / vehicle type | context for resource hints, but VIN is personal data | skip |
| **Costs** | buy a dongle, pair it every drive, BLE-vs-Classic, Android-only, a new demo failure mode, battery drain | high for the gain |

The old plan's OBD material is the likeliest ancestor of your OBD pack; if the pack still has the wrong PIDs or the airbag claim, that is a credibility risk in front of a jury that includes engineers.

### 4.3 Verdict
**NO-GO for the 48 h build.** Present it as a roadmap item ("vehicle link"), not as a feature. If, after G4, you have ≥ 6 h of slack **and** a BLE ELM327 that connects in under a minute on a demo phone, the only version worth building is **"Vehicle link (lite)"**: read PID 0D at the best rate the dongle allows, show it in Drive mode, and feed it to the *same* detector as the speed series. Nothing else.

---

## 5. The IoT box

### 5.1 Facts
- **ADXL375**: 3-axis **±200 g** digital MEMS accelerometer, SPI/I²C, bandwidth up to 1 kHz, "shock event detection" (Analog Devices). Compare: phone ±8–16 g.
- **Freematics ONE+**: an off-the-shelf OBD-port telematics board — ESP32, u-blox GNSS, an IMU, Wi-Fi/Bluetooth, optional cellular modem; **$109.90 with modem**; open-source (BSD) Telelogger firmware. Proof the "plug-in box" form factor is real and buildable.
- **Algeria 2G/3G**: the government briefing (April 2026) targets **final shutdown of 2G and 3G by 2029**. A 2G-only modem (SIM800-class) is a dead end for a product; choose an **LTE** module *(my knowledge: SIM7600/A7670 families are LTE)*.
- **Homologation**: Executive Decree **26-97** (31 Jan 2026, in force) covers electronic-communications equipment **including IoT modules**; cellular devices need a **GSMA TAC**; ARPCE/ANF **label before sale**. It targets importers/distributors; whether a one-off prototype is exempt is **not stated in the source I could read** — ask ARPCE. Irrelevant for a demo, decisive for a product.
- **Novelty:** ESP32 + accelerometer + GSM "accident detection" appears in many academic/student projects. The sensor is not the innovation; the **system** (SMS-capable packet, merge, explainable severity, hospital ranking, humans in the loop) is.

### 5.2 Options

| Option | What | Effort (assumption) | Jury impact | Risk to core |
|---|---|---|---|---|
| A | Roadmap slide only | 0 | low–medium | none |
| **B** | **`BOX (simulated)`**: a replay source labelled BOX that plays a *high-g* trace (unclipped) and sends a packet with `G38`; one slide explains why a box exists (§3) | 2–3 h | medium, **honest** | low |
| C | Buy Freematics ONE+ | lead time/customs/homologation questions | — | not realistic in 48 h |
| D | Build ESP32 + ADXL375 + LTE modem + SIM + enclosure | 12–20 h for someone who has done it | high if it works | **high** (SIM registration, power, venue network) |
| E | Bench demo: ESP32 + ADXL375 + OLED prints the packet on a hit; operator pastes it into "Simulate SMS" | 6–8 h | medium–high ("hardware wow") | medium, off the critical path |

### 5.3 GO criteria for D or E (all must be true)
1. **G4 passed** (data OFF → real SMS → pin) before H26 and the hero flow is stable.
2. **A named teammate** has built an ESP32 project before **and** the parts are already in hand (ADXL375 breakout, LTE modem, SIM with credit, power).
3. The firmware reuses our contract: port `encodeDzmsd` (CRC-8, body formatting, Plus Code) using `crosscheck.py` as the seed and **the same 302 + 134 golden vectors** as the acceptance test.
4. It cannot delay feature freeze (H36).
Otherwise: **B**.

### 5.4 Honest claims for the pitch
Say: "phones are our sensor today and they saturate at about ±16 g; a plug-in box with a ±200 g sensor is the next source, and the protocol does not change." Do **not** say: the box is tested, certified, approved by ARPCE, or detects airbag deployment.

---

## 6. A better proposition: one protocol, pluggable sources

```
 sources                       packet (≤160 GSM-7)         channels            server               humans
 Phone  (auto, SA)  ─┐
 Witness (SW, web/app) ─┤──►  SLK1 id band… #CRC  ──►  HTTPS | SMS  ──►  decode → assess → merge  ──►  dispatcher
 Manual SOS (SM)    ─┤                                                    → rank hospitals            ──►  hospital
 Box (SD, roadmap)  ─┘   ← same contract, one new source letter                                          ──►  crew
```

- **Today (48 h):** phone + witness + manual + dispatcher + hospital + crew. This is already a complete, defensible system.
- **Roadmap:** a `D` (device) source letter and "G may exceed phone range" — a **protocol v1.1** change, to be made only through the `sellekni-protocol` procedure (update docs/05 → `crosscheck.py` → `pnpm vectors` → review → `pnpm check`). Not applied now.
- **Why this beats both add-ons:** it keeps the demo focused, turns hardware into an *extension of the contract you already tested*, and answers the jury question "what about cars without phones / drivers who don't install apps?" with a concrete, honest path.

---

## 7. Review protocol for the two repos (run as soon as access exists)

**How to review external repositories (any one):** (1) clone the repos into local workspaces; (2) on GitHub use **Code → Download ZIP** for each repo and extract; (3) review the README and the file tree of each, then inspect the technical docs.

**`3imss/obd-connected-pack` — questions to answer**
1. What is in it: firmware, an Android/RN reader, PID tables, a protocol, docs?
2. Are the PIDs right (speed = `0D`, RPM = `0C`, km/h)? Any "0x00A", mi/h, or acceleration PIDs? (docs/11 row 9)
3. Any claim that a generic dongle reads **airbag/SRS** status? → remove or label vehicle-specific.
4. BLE or Bluetooth Classic? Which library? Does it run in an **Expo dev build**?
5. Was the polling rate **measured** on a real car/dongle? Which adapter?
6. Does it define its **own packet**? Reconcile with DZ-MSD (the old plan already had two incompatible formats).
7. Licence, tests, does it build?

**The team's earlier repo → `docs/solvex` — questions to answer**
1. Diff by topic against docs 03–11: what is *better* there (ideas worth porting) vs *wrong* (docs/11 §A list: which of the 20 errors still exist?).
2. IoT: bill of materials, accelerometer range (±16 g parts clip real crashes), modem generation (2G?), power, SMS vs HTTP, cost, homologation, who builds it.
3. Unsourced numbers ("18 min", "<30% GPS", "72% 4G", …) still present?
4. Is the hardware needed for the *story*, or decorative?

**Scoring rubric (each 0–3):** impact on the jury · feasibility in the hours left · risk to the core flow · honesty (claims sourced) · reuse of our tested contract. Port only what scores ≥ 8 of 15 and never breaks a "never cut" item (docs/09 §4).

---

## 8. The absolute best next step

**Do, in this order (time-boxed):**
1. **Name freeze — 30 min, whole team.** Latin spelling, **Arabic spelling**, one-line meaning for the pitch, wire magic (`SLK1` recommended), Android package id and URL scheme, who owns the logo fixes.
2. **Run `rename-magic.mjs SLK1` — 15 min** (dry run first), merge, tell everyone to rebase. Do it *before* P5 fixtures and before the pitch deck exists.
3. **P4 range-aware detector — 1–2 h** (§3). Clipped traces; multi-axis cue (docs/13 §4.1); Sensor Lab prints range and rate on each demo phone.
4. **Finish P5 → Gates G3 and G4.** This is the differentiator and the riskiest piece; nothing else may delay it.
5. **Send me the two repos** (§7 options) and I produce the comparison and the final go/no-go on the hardware in about an hour of work.
6. **Logo fixes in parallel (D)** — vector mark, mono, no cross.

**Do not do now:** OBD integration, hardware purchase, new protocol letters, renaming the package scope.

## 9. Sources (checked 2026-10-30)
- Algeria 2G/3G shutdown by 2029 — [algerie-eco.com](https://algerie-eco.com/2026/04/09/algerie-la-desactivation-des-reseaux-2g-et-3g-prevue-en-2029/)
- Executive Decree 26-97 (homologation, IoT modules, TAC, labels) — [algeriatech.news](https://algeriatech.news/arpce-decree-26-97-equipment-homologation-2026/) (secondary summary; read the Official Gazette no. 13 for exemptions and penalties)
- OBD-II PIDs (speed `0D`, RPM `0C`, no airbag PID, non-standard PIDs) — [Wikipedia: OBD-II PIDs](https://en.wikipedia.org/wiki/OBD-II_PIDs)
- On-board diagnostics (OBD-II 1996, EOBD 2001/2004, pin 16 battery) — [Wikipedia: On-board diagnostics](https://en.wikipedia.org/wiki/On-board_diagnostics)
- ELM327 (clones, v1.4 bugs, vendor closure) — [Wikipedia: ELM327](https://en.wikipedia.org/wiki/ELM327)
- `react-native-ble-plx` (BLE only, Expo dev build) — [GitHub](https://github.com/Polidea/react-native-ble-plx)
- Phone accelerometer limit (BMI160 ±16 g, 87 g drop) — [CMTG: the smartphone accelerometer myth](https://www.cmtg.com/djb/news/smartphone-accelerometer-myth)
- Android max range is device-specific (anecdote) — [forum thread](https://forum.earlybird.club/threads/accelerometer-maximum-range-different-on-each-device-and-limited.1217166)
- iPhone 14 high-g accelerometer up to 256 g — [PhoneArena](https://www.phonearena.com/news/apple-iphone-14-accelerometer-gyro-specs-crash-detection_id142433)
- Crash-detection gates and event magnitudes (vendor blog) — [Damoov](https://damoov.com/crash-detection-algorithms-minimize-false-positives-telematics)
- ADXL375 ±200 g — [Analog Devices](https://www.analog.com/ADXL375)
- Freematics ONE+ — [Hackster.io](https://www.hackster.io/news/freematics-one-aims-to-set-your-odb-ii-port-free-with-wi-fi-bluetooth-cellular-data-logging-d4cd2aa78a73)
- Automatic shutdown (28 May 2020) — [MacRumors](https://www.macrumors.com/2020/05/01/automatic-shutting-down-may-28/)
- Red Cross / Red Crescent emblem misuse — [ICRC](https://www.icrc.org/en/doc/resources/documents/article/other/57jmb9.htm)
- Logo colour measurements and the rename test: done on the image you sent and on a copy of this pack (reproducible with `scripts/rename-magic.mjs`).
