# 13 — Phone-first sensing: how Sellekni detects a crash with the phone alone, and how to prove it

> **Decision (2026-10-30, team):** *the phone sensors are the main path.* ESP32 / OBD / a custom box are **roadmap only** (docs/16). This document is the detailed plan for the main path, and it ships with a **tested reference implementation**: `packages/detector` (`@sellekni/detector`, 20 tests, zero runtime dependencies).
>
> **Honesty first.** Everything below that is a number is either (1) *sourced* (link in §10), (2) *computed* by the reference code (reproducible: `pnpm --filter @sellekni/detector report`), or (3) an **ASSUMPTION** to tune with real recordings (§7). The tests use **synthetic traces I generated**; they prove the *logic* behaves as designed, **not** that it works on real roads. The real proof is the Realme field protocol in §6–§7.

---

## 1. What a phone can sense (and what each signal is for)

| Signal | How we read it | What it tells us | Limits | Privacy | Role |
|---|---|---|---|---|---|
| **Acceleration** | `expo-sensors` Accelerometer now; Kotlin `SensorManager` in the native module (also gives the **max range**) | impact strength *and duration*; stillness afterwards | **saturates** (typ. ±8–16 g, device-specific); Android 12+ caps each sensor at **200 Hz** unless `HIGH_SAMPLING_RATE_SENSORS` | none leaves the phone | **core** |
| **Rotation (gyro)** | same | rollover (integrated rotation), tumbling | drift; a phone picked up by hand also rotates → needs the "came to a stop" gate | none | **core** |
| **GPS speed** | `expo-location` (Doppler speed) | speed *before* (arming), speed collapse, "stopped" | ~1 Hz, **latency** (assume 0.8 s, measure it: T5), poor in tunnels | location is the product; consented | **core** |
| **Location fix** | same | where; Plus Code for the verbal relay | accuracy 3–30 m | consented | **core** |
| **Barometer** | `Sensor.TYPE_PRESSURE` (native) | sudden cabin pressure change when airbags deploy (the cue Apple uses) | **the Realme 10 Pro+ spec sheet lists no barometer** → "if present" | none | stretch, opportunistic |
| **Microphone level** | native, *level only* | very loud transient (crash noise) | noise in cars; battery | **record nothing, store nothing, opt-in, off by default** | stretch (v1.1) |
| **"In a car" context** | Bluetooth-connected-to-car, charging, Activity Recognition (Play Services) | raises arming confidence, lowers false positives | permissions, device-specific | consented | stretch (v1.1) |
| **User response** | countdown screen | the final human gate: *I'm OK* / *Send help now* / no response (flag `N`) | — | — | **core** |

Apple's own write-up of Crash Detection is the blueprint for the *kind* of fusion: accelerometer + gyroscope for the impact, GPS for "travelling fast", microphone for crash sounds, barometer for airbag pressure, plus in-car cues — and the stated lesson that **several signals must agree**, which is why a dropped phone or a minor fender-bender does not trigger it ([TechCrunch](https://techcrunch.com/2022/10/10/apple-offers-a-deeper-dive-into-crash-detection)). We use fewer signals (the 48 h scope), so our gates must be sharper and our language more modest.

## 2. The four physical facts that shaped the design

### 2.1 The accelerometer saturates — so *duration at the ceiling* replaces *amplitude*
Published full-frontal tests at 56 km/h show vehicle-level peaks of **36.6–46.0 g** over **91–113 ms** ([Locey et al. 2012](https://pmc.ncbi.nlm.nih.gov/articles/PMC3503406)). A phone sensor that tops out at ±8 or ±16 g (one drop test: BMI160 ±16 g, an 87 g drop "could not be resolved" — [CMTG](https://www.cmtg.com/djb/news/smartphone-accelerometer-myth); Android's `getMaximumRange()` is device-specific) can only report *"at least this much"*. Apple needed a new sensor up to 256 g for iPhone 14 ([PhoneArena](https://www.phonearena.com/news/apple-iphone-14-accelerometer-gyro-specs-crash-detection_id142433)).

What survives clipping is **how long the sensor sits at its ceiling**. For a half-sine pulse of peak *p* and duration *T*, on a sensor with range *R*:

```
Δv            = (2/π) · p · g · T            (so T is solved from the Δv you want)
t_saturated   = T · (π − 2·asin(0.95·R / p)) / π
```
Computed with the reference generator (frontal_45: Δv 45 km/h, p = 32 g → T = 62.6 ms), and **matching the replayed traces** for the axis-aligned mount within 10 ms (a test enforces it for ±8 and ±16 g):

| Sensor | t_saturated (model) | measured in replay (3 mounts × 20 seeds) |
|---|---|---|
| ±8 g | 53 ms | 53 ms |
| ±16 g | 43 ms | 41 ms |
| ±32 g | 13 ms | 8 ms (only 37/60 runs touched the ceiling: a rotated mount spreads the pulse over axes) |

A pothole (6 g / 20 ms) never reaches the ceiling of a ±8 g phone; a crash sits there for tens of milliseconds. **So the rules use the thresholds `min(θ, 0.95·R − 1 g)` and the time spent at the ceiling, and the UI says "≥ 16 g (sensor limit)" — never "38 g measured by the phone".** `G` in the packet is `min(peak, range)`; Δv comes from GPS, **never** from integrating a clipped signal.

### 2.2 The phone is not bolted to the car (coupling)
In a mount, in a pocket, on a seat, in a bag: the pulse the phone sees is the vehicle's pulse filtered by whatever holds it. We therefore treat the phone as an **event detector with corroboration**, not a g-meter. The tests rotate every trace into three mounts (`aligned` — frontal pulse lands almost entirely on one axis; `tilted`; `pocket` — random orientation) and clip per axis.

### 2.3 GPS is slow, and the window has to budget for it
Doppler speed arrives about once a second and lags the car. In the reference tests a vehicle that stops 4 s after a rollover trip showed "stopped" **5.25 s** after the trigger — **outside the 5 s window I wrote in docs/04**. The detector now judges an event **8 s** after its trigger (5 s + a ~3 s budget for lag and 1 Hz fixes). Result: the frontal crash is still detected with GPS lag from 0 to 7 s (test covers 0–7 s). Cost: the countdown starts ~8 s after the impact; the 30 s countdown can be shortened by the time already elapsed (product decision, §3.4).

### 2.4 There is a minimum sampling rate
Replaying the same frontal crash at lower rates: **200 Hz 20/20 · 100 Hz 20/20 · 50 Hz 20/20 · 25 Hz 11/20 · 12.5 Hz 0/20**. The detector therefore **measures its real rate** and exposes `rateOk` (false below 45 Hz); the app must show "sensor too slow — detection unreliable, use SOS/witness mode" instead of silently under-protecting. Sensor Lab test T3 measures the Realme's real rate.

## 3. The detector (reference implementation)

### 3.1 Pipeline

```
GPS ≥ 25 km/h held 10 s ──▶ ARMED                  (below ±8 g range → UNSUPPORTED: SOS/witness only, and say why)
ARMED, per sample: dynamic accel  dm = | a − baseline |   (baseline = 1 s EMA of the quiet signal → orientation- and gravity-agnostic)
  dm ≥ min(4 g, 0.95R−1)  → open an EVENT, then watch for 8 s:
       peak, longest run above min(2.5 g, 0.95R−1), time at the ceiling, axes active, integrated rotation
  at +8 s, judge with GPS history:
     speed before = max speed in [−4 s, −0.5 s] · speed after = min speed in [+0.5 s, +8 s] · Δv = before − after
     rule (a)  peak ≥ eff(4 g) AND high-g run ≥ 30 ms AND Δv ≥ 20 km/h
     rule (b)  peak ≥ eff(8 g) AND high-g run ≥ 20 ms AND Δv ≥ 10 km/h
     rule (c)  rotation ≥ 90° AND speed before > 25 km/h
     AND the vehicle came to a stop (a fix < 5 km/h within the window)           ← all rules need this
  → ALERT (reasons[] for the countdown screen)  — or REJECTED (rejected[] kept for the Sensor Lab)
ALERT → app runs the 30 s countdown ("I'm OK" / "Send help now" / no response → flag N) → acknowledge() → ARMED
```
Drawing: `docs/diagrams/03-detector-pipeline.svg`.

### 3.2 Parameters (all ASSUMPTIONS — named in `PARAMS`, change only with data)

| Name | Value | Why |
|---|---|---|
| `armSpeedKmh` / `armHoldMs` | 25 km/h / 10 s | phone drops while walking or parked never arm |
| `triggerG` / `highG` / `strongG` | 4 / 2.5 / 8 g | from the original rules (docs/04); *range-capped at runtime* |
| `minHighMs` / `minHighStrongMs` | 30 / 20 ms | potholes and drops are shorter; one glitchy sample can never alert |
| `satFrac` | 0.95 | `|a_axis| ≥ 0.95·R` counts as "at the ceiling" |
| `minRangeG` | 8 g | a ±2/±4 g sensor cannot tell a pothole from a crash → UNSUPPORTED |
| `dropAKmh` / `dropBKmh` | 20 / 10 km/h | speed collapse (GPS) |
| `rollDeg` | 90° | integrated gyro magnitude in [−0.5 s, +2.5 s] |
| `stopKmh` | 5 km/h | "came to a stop" |
| `evalDelayMs` | 8 000 ms | §2.3 |
| `minRateHz` | 45 Hz | §2.4 |

### 3.3 What goes into the packet (contract unchanged)
`toPacketHints(decision, range)` → `G = min(peak, range)`, `D = Δv from GPS`, `RO`. Flag `N` comes from the countdown. A test builds a packet from a ±8 g alert, encodes it (≤ 160 chars), decodes it, and checks that the server-side score from a clipped `G` can never exceed what a real 38 g reading would give. **The phone's richer cues (time at ceiling, axes, reasons) stay on the phone for the countdown screen and the Sensor Lab; putting them on the wire is a protocol v1.1 change (docs/12 §6) and not part of the 48 h build.**

### 3.4 The countdown screen explains *why* it triggered
Machine keys → ar/fr/en sentences (no free text in the detector): `speed_collapse` ("Your speed dropped sharply"), `impact_sustained` ("A strong, sustained impact"), `impact_at_sensor_limit` ("The impact was at your phone's sensor limit"), `rotation` ("The phone turned over"), `came_to_stop` ("The vehicle stopped"). This is the explainability principle applied on the phone, and it makes "I'm OK" feedback meaningful.

## 4. What the tests show (and don't)

Run it: `pnpm --filter @sellekni/detector report` · `pnpm --filter @sellekni/detector test`. Results for 3 mounts × 20 seeds per cell:

| Scenario (synthetic) | Must | ±4 g | ±8 g | ±16 g | ±32 g |
|---|---|---|---|---|---|
| `frontal_45` (Δv 45 km/h, 32 g peak) | alert | unsupported | 60/60 | 60/60 | 60/60 |
| `rollover_71` (trip 20 g, ~360° roll, slide) | alert | unsupported | 60/60 | 60/60 | 60/60 |
| `speed_bump` (brake 50→25, bump 6 g/60 ms) | no alert | — | 0/60 | 0/60 | 0/60 |
| `hard_brake` (90→0 at 0.8 g) | no alert | — | 0/60 | 0/60 | 0/60 |
| `phone_drop` (free fall + clipped impacts, car keeps going) | no alert | — | 0/60 | 0/60 | 0/60 |
| `pothole_80` (6 g / 20 ms) | no alert | — | 0/60 | 0/60 | 0/60 |
| `pothole_then_stop` (pothole, then brake to a red light) | no alert | — | 0/60 | 0/60 | 0/60 |
| `door_slam`, `walking_pocket` | no alert | — | 0/60 | 0/60 | 0/60 |
| `fender_bender_12` (12 km/h shunt) | **not detected, by design** | — | 0/60 | 0/60 | 0/60 |

**Ablation — every gate earns its place** (switch one off, a specific hard negative gets through; tests enforce it):

| Gate removed | What leaks | Why it matters |
|---|---|---|
| duration (`minHighMs`) | `pothole_then_stop` alerts | speed collapse **and** a stop are both true there; only the short pulse rejects it |
| came-to-a-stop | `speed_bump` alerts (brake, then a hard bump) | |
| speed collapse (+ stop) | `phone_drop` alerts | |
| 25 km/h arming + Δv 20 | a 12 km/h shunt alerts | this is a **known limitation**: minor low-speed crashes are not detected (Apple also deliberately ignores minor fender-benders). Witness mode and SOS cover them |

**What this does *not* show.** Real phones, real mounts, real GPS, real roads. The negatives are the ones I could imagine; reality will find others. Expect to retune thresholds after §7. **Do not quote a detection rate on stage** — say "we tested the logic against N synthetic scenarios and are validating on real driving traces".

### 4.1 Corrections to my earlier docs, made after building this
1. **Confirm window 5 s → 8 s** (§2.3). 2. The **"multi-axis gate"** I recommended in docs/12 §3 is demoted to a *reported cue* (`axesActive`): an axis-aligned mount sends a frontal crash almost entirely onto one axis, so a hard gate would reject real crashes; the gates that discriminate are speed history, high-g duration (incl. time at the ceiling), speed collapse and the stop (ablation table). Vendors list it as practice; re-evaluate on real traces. 3. **Δv window** is measured over the whole evaluation window, not "3 s", for the same latency reason. 4. **Sensors below ±8 g are refused** (UNSUPPORTED). 5. **Minimum sampling rate** is measured at runtime.

## 5. Replay traces (the stage safety net)
`pnpm --filter @sellekni/detector traces` writes 22 CSVs + `manifest.json` to `packages/detector/traces/` (ranges ±8 and ±16 for all scenarios, plus ±200 g "BOX (simulated)" for the two crash scenarios; seed 1, tilted mount). Format: `t_ms,ax,ay,az,gx,gy,gz,speed_kmh` (speed only on rows where a GPS fix arrives) — the **same format the Sensor Lab (M9) records**, so a real trace drops in with no code change. Every replay is labelled **REPLAY · SYNTHETIC** on screen. Use `frontal_45` and `rollover_71` for the demo and `phone_drop` + `pothole_then_stop` to show the gates working ("the same code that rejects these two"). *If the team's detector already exists, feed these CSVs through it and compare the decisions — that is the quickest integration check.*

## 6. Field guide: Realme 10 Pro+

### 6.1 What is known (sourced) and what must be measured
Known from the spec sheet ([GSMArena](https://m.gsmarena.com/realme_10_pro+-11952.php)): launched with **Android 13 / Realme UI 4.0** (the team confirmed on 2026-10-30 that this phone now runs **Android 14**, the Realme UI 5.0 generation; menu names differ from the Android 13 ones below, write the real ones in the team wiki); chipset **Dimensity 1080** (a 920 variant is also listed); sensors listed: **accelerometer, gyro, proximity, compass** (no barometer); **dual nano-SIM**; 5000 mAh. **Unknown until measured:** the accelerometer's max range and resolution, the real sampling rate, the exact Realme UI version (Settings → About device; Android 14 is confirmed), GPS speed latency, whether sensors keep streaming with the screen off.

### 6.2 Set-up checklist before any test (write the *actual* menu names on your phone in the team wiki)
1. Sideload the APK; on first launch grant location, notifications, SMS, **and "Allow background activity"**. If Android shows a *restricted setting* for a sideloaded app (App info → ⋮ → *Allow restricted settings*), the onboarding must detect a denied SMS permission and guide the user (docs/03 M1: degrade, never dead-end).
2. Realme/ColorOS battery management: Settings → Battery → *App battery management* → Sellekni → **Allow auto-launch, Allow foreground activity, Allow background activity, Optimize battery use = off** ([dontkillmyapp: realme](https://dontkillmyapp.com/realme) — the page rates realme 3/5 and says restrictions are "not fully uncovered"; also turn off *Power saving*, *Super power saving*, *Smart Performance* and *App quick freeze* for Sellekni). Menu names vary by version — verify on the device.
3. A **foreground service of type `location`** (needs `FOREGROUND_SERVICE_LOCATION`, fine/coarse location granted *before* start — [Android docs](https://developer.android.com/about/versions/14/changes/fgs-types-required?hl=es)) is the right container for Drive mode. Whether the accelerometer keeps flowing with the screen off on this phone is **test T6**, not an assumption. For rates above 200 Hz declare `HIGH_SAMPLING_RATE_SENSORS` ([Expo](https://docs.expo.dev/versions/v57.0.0/sdk/sensors/)); you do not need it (50–100 Hz is enough).
4. Dual SIM: choose the SIM that sends SMS to the gateway in Settings (M8) and test it with data off.

### 6.3 Sensor Lab test plan (M9) — run on the Realme, record the result in `docs/field-notes/`
| # | Test | How | Record | Pass criterion (team decides; my suggestion) |
|---|---|---|---|---|
| T1 | Inventory | list sensors (name, vendor, max range, resolution, min delay) | screenshot + CSV | range known → set `rangeG`; ≥ 8 g else SOS-only |
| T2 | Rest noise & gravity | phone flat 60 s | mean/σ of \|a\| per axis | mean ≈ 1 g; σ small enough that `dm < 0.5 g` at rest |
| T3 | Real sampling rate | request 50 / 100 / 200 Hz, screen on, 5 min | median & p95 Δt | median ≥ 50 Hz (`rateOk`) |
| T4 | Saturation probe | padded drops (10–20 cm onto a mattress), firm taps | max \|a\| per axis, plateau? | learn the true ceiling; compare with T1 |
| T5 | GPS speed latency & rate | constant speed on a straight road; one controlled brake in an empty car park | fix interval; lag between brake onset (accelerometer) and speed fall | lag ≤ 3 s, else raise `evalDelayMs` |
| T6 | Screen-off survival | Drive mode 30 min, screen off, phone in pocket/mount | sample count, longest gap | no gap > 1 s; if it fails, Drive mode requires screen-on and the demo says so |
| T7 | Battery cost | 60 min screen on (dimmed) vs foreground-service | % drained | team decides what is acceptable and states it honestly |
| T8 | Hard-negative suite | low-speed driving in a safe closed area: bumps at 20–30 km/h, hard braking from 30, door slam, phone dropped on the seat, pocket/bag, pothole-like ramps — **5 repetitions each** | decisions + metrics | **0 alerts**; every candidate logged |
| T9 | Permission & battery drill | fresh install on a factory-fresh profile | click path + screenshots | a teammate who never saw the app completes it unaided |
| T10 | Airplane-mode drill | data off, SMS on | alert reaches the gateway by SMS | docs/04 §3.5 |

## 7. From synthetic to real: the recording protocol
- **Never stage a crash.** Real-world tests are *negatives and low-speed manoeuvres* in a closed, legal, safe area, with a passenger operating the phone. Positive crash behaviour is validated with **synthetic traces and, if obtainable, public data** — e.g. the vehicle-mounted IMU crash dataset VZCrash (licence/gating to check), NHTSA crash-test accelerations, UAH-DriveSet for normal/aggressive driving (check the licence of each before use; none is a phone-in-pocket crash dataset).
- Sensor Lab records the CSV above plus a one-line label (scenario, mount, vehicle, road, phone model, Android version). Strip GPS coordinates before sharing traces (location is personal data); keep only speed.
- Tune thresholds on a **training** set of recordings, report on a **separate** set; state both sizes. Keep `PARAMS` changes in `DECISIONS.md` with the date and the evidence.
- Opt-in "this was a false alarm" feedback (from the countdown's *I'm OK*) is the long-term source of hard negatives.

## 8. Stretch cues (not in the 48 h build; each needs a contract/privacy decision)
Barometer spike (if the sensor exists), microphone *level* spike (no recording), "connected to a car / charging" context, Activity Recognition "in vehicle". They would raise confidence and lower false alarms; they would also need new tokens (protocol v1.1) and consent text. Mention them as the roadmap for the phone path — they are what Apple fuses.

## 9. What we say on stage about phone sensing
- **Say:** "Your phone already contains the sensors; we detect a severe, sustained deceleration followed by a stop, we ask you to confirm, and we never replace the call to 14/1021." "Phone sensors saturate, so we report 'at least N g' and rely on how long the sensor stays at its ceiling and on the GPS speed collapse." "We tested the logic against synthetic scenarios, including the traps that fool simple detectors (pothole then braking, a dropped phone, a speed bump), and we are validating on real traces."
- **Don't say:** a detection rate, "AI", "better than Apple/Google", "measures 38 g", or anything about OBD/IoT as existing features (docs/12 §4–5 and docs/16: roadmap).

## 10. Sources (checked 2026-10-30)
- Frontal crash pulses at 56 km/h (peaks 36.6–46.0 g, durations 90.8–112.9 ms) — [Locey et al., *Homogenization of Vehicle Fleet Frontal Crash Pulses from 2000–2010*](https://pmc.ncbi.nlm.nih.gov/articles/PMC3503406)
- Phone accelerometer limit (BMI160 ±16 g; 87 g drop unresolved) — [CMTG](https://www.cmtg.com/djb/news/smartphone-accelerometer-myth); iPhone 14 high-g sensor up to 256 g — [PhoneArena](https://www.phonearena.com/news/apple-iphone-14-accelerometer-gyro-specs-crash-detection_id142433)
- Apple Crash Detection signals and false-positive lessons — [TechCrunch](https://techcrunch.com/2022/10/10/apple-offers-a-deeper-dive-into-crash-detection)
- Vendor view on gates and event magnitudes (not peer-reviewed) — [Damoov](https://damoov.com/crash-detection-algorithms-minimize-false-positives-telematics)
- Android 12+ 200 Hz limit / `HIGH_SAMPLING_RATE_SENSORS` — [Expo sensors docs](https://docs.expo.dev/versions/v57.0.0/sdk/sensors/)
- Foreground service types and requirements — [Android 14 changes](https://developer.android.com/about/versions/14/changes/fgs-types-required?hl=es)
- Realme 10 Pro+ specification — [GSMArena](https://m.gsmarena.com/realme_10_pro+-11952.php); background-process restrictions — [dontkillmyapp.com/realme](https://dontkillmyapp.com/realme)
