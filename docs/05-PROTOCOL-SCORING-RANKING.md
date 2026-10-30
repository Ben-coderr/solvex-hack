# 05 — Protocol, Scoring, Ranking, Merge (the contract)

> **Status:** implemented and tested in `packages/shared` (TypeScript, zero runtime dependencies). 67 unit/property/golden tests, 5 golden vector files, and an **independent Python re-implementation** (`scripts/crosscheck.py`) that agrees on 302 packets, 134 invalid messages, 405 scoring cases and the ranking example.
> Run it: `pnpm check`.
> **Everything marked ASSUMPTION is a design choice, not a validated fact.** Weights, thresholds, bands and the ranking formula are uncalibrated and need clinical review. Sellekni is decision support: a human always decides.

---

## 1. DZ-MSD v1 — the SMS packet

DZ-MSD = "Algerian Minimum Set of Data", inspired by the eCall MSD (≤ 140 bytes) but our own format, **not a standard**.

### 1.1 Grammar

```
message   = body SP "#" CRC
body      = "SLK1" SP id SP assess SP coords *(SP token)
id        = 5 * crockford          ; client-generated, idempotency key. 0-9 A-Z minus I L O U
assess    = band score conf        ; R75H
band      = "R" / "O" / "Y" / "G" / "U"
score     = 2DIGIT                 ; 00..99 (NSI, a HINT: the server recomputes)
conf      = "H" / "M" / "L"
coords    = lat "," lon            ; 5 decimals (~1.1 m), e.g. 36.47213,2.82871 ; never "-0.00000"
token     = "T" HHMM               ; REQUIRED  local Algeria time (UTC+1, no DST)
          / "S" ("A"/"W"/"M")      ; REQUIRED  source: Auto / Witness / Manual SOS
          / "V" 1*2DIGIT           ; REQUIRED  vehicles
          / "P" 1*2DIGIT           ; REQUIRED  persons
          / "K" 1*kind             ; REQUIRED  C car · M moto · T truck · B bus · P pedestrian · X other
          / "D" 1*3DIGIT           ; delta-v km/h
          / "G" 1*3DIGIT           ; peak g
          / "RO"                   ; rollover
          / "F" 1*flag             ; N no-response · U unresponsive · B breathing · H heavy bleeding
                                   ;   E ejected · D death in vehicle · X trapped · C child · F fire
          / "HR" 1*3DIGIT          ; bpm
          / "SP" 1*3DIGIT          ; SpO2 %  (0..100)
          / pluscode               ; 8F84FRCH+VF  (10-digit Plus Code, for verbal relay)
CRC       = 2HEXDIG(upper)         ; CRC-8 over `body` (everything before " #")
```

Rules:
- **Tokens after the header are order-free**; the encoder always emits the *canonical* order shown above, with `K` and `F` letters in canonical order (`C M T B P X` / `N U B H E D X C F`). `decode(encode(p))` is a fixed point.
- **Pure basic GSM-7**: only `A-Z 0-9 space . , + - #`. No Arabic, no accents, no `{ } [ ] ~ \ ^ |` (extension chars cost 2 septets, and *one* non-GSM char makes the SMS UCS-2 = 70 chars max).
- **Length budget** (measured): typical auto-detected packet = **91 chars (69 spare)**; witness packet = 72; **absolute worst case = 113 (47 spare)**. Limit = 160.
- **Unknown tokens** with an unassigned prefix are ignored with a warning (forward compatibility). Known tokens that are malformed are errors.
- The callback number is **not** in the packet: the SMS sender ID carries it. Medical profile data **never** goes in an SMS.
- Tolerant input: the decoder trims, collapses whitespace (incl. NBSP) and upper-cases before checking the CRC (SMS keyboards auto-correct).

### 1.2 Canonical examples (golden)

```
SLK1 K7Q2M R75H 36.47213,2.82871 T1432 SA V1 P1 KC D71 G38 RO FN HR124 SP89 8F84FRCH+VF #0E   (91 chars)
SLK1 P3N8D Y44M 35.69112,-0.63305 T0915 SW V1 P2 KCP FXC 8C7XM9R8+CQ #30                       (72 chars)
```
Human reading of the first: *Red, score 75, high confidence · 36.47213,2.82871 · 14:32 · auto-detected · 1 vehicle 1 person · car · Δv 71 km/h · 38 g · rollover · no response to countdown · HR 124 · SpO2 89 · Plus Code 8F84FRCH+VF.*

> **Note on `G38`.** It is a *protocol* example (what a high-g sensor could report). A phone reports at most its accelerometer range (typically ±8–16 g), so phone packets carry `G = min(peak, range)` and the UI says "≥ N g (sensor limit)". The NSI term `peak ≥ 20 g → +5` can therefore only come from a high-g source. See docs/12 §3.

### 1.3 CRC-8

CRC-8/SMBUS: poly `0x07`, init `0x00`, no reflection, xorout `0`. **Check value:** `crc8("123456789") = 0xF4` (tested). Computed over the ASCII bytes of `body`, printed as 2 uppercase hex digits.

**It is an integrity check, not authentication.** It detects any single-character error (tested exhaustively: 6,000+ substitutions) but anyone can forge a valid CRC. See §7.

### 1.4 Decoder error codes

`empty` · `bad_magic` · `missing_checksum` · `bad_checksum_format` · `checksum_mismatch` · `too_few_tokens` · `bad_id` · `bad_assessment` · `bad_coordinates` · `out_of_range` · `bad_token` · `duplicate_token` · `missing_field` · `bad_pluscode`.
**A message that fails to parse is stored as an unparsed report and shown raw to the dispatcher. It is never dropped.**

### 1.5 Time and ids

- `T` is local time `HHMM` (Algeria is UTC+1 all year). The date comes from the receive timestamp: `resolveCrashTime(hhmm, receivedAt)`; if the result is > 5 min in the future, the crash was "yesterday" (midnight rollover).
- `generateIncidentId()` → 5 Crockford chars (32⁵ ≈ 33.5 M). On React Native inject `expo-crypto`'s random bytes: `generateIncidentId((n) => Crypto.getRandomBytes(n))`.
- Plus Code: `encodePlusCode(lat, lon)` (dependency-free, cross-checked against Google's reference library on 20,000 random points). The decoder warns if the Plus Code disagrees with the coordinates by more than ~55 m.

---

## 2. The JSON channel (internet)

Same semantics, richer. `POST /api/incidents` (idempotent on `incident_id`):

```json
{
  "v": 1, "incident_id": "K7Q2M", "source": "auto",
  "created_at": "2026-10-30T14:32:07+01:00",
  "location": { "lat": 36.47213, "lon": 2.82871, "acc_m": 8, "heading": 175, "plus_code": "8F84FRCH+VF" },
  "crash": { "dv_kmh": 71, "peak_g": 38, "rollover": true, "multi_impact": false, "no_response": true },
  "scene": { "vehicles": 1, "persons": 1, "kinds": ["car"], "flags": ["no_response"], "fire": false },
  "vitals": { "hr": 124, "spo2": 89, "source": "ble_watch" },
  "medical": { "blood": "O+", "anticoagulant": false, "allergies": [], "consent": true },
  "contact": { "callback": "+213XXXXXXXXX", "lang": "ar" },
  "device": { "app": "najda/0.1", "battery": 61 }
}
```
- Validate with **zod** on the server. `medical` is accepted only with `consent: true` and is stored separately with a short retention. Never log it.
- The server converts JSON → the same internal `DzmsdPacket`/`AssessmentInput` so there is **one** scoring path for both channels.
- Idempotency: an SMS and a JSON with the same `incident_id` merge into one incident (they are the *same* report on two channels).

### 2.1 Crew update (SLK1U) — stretch feature, JSON first
The ambulance crew can submit GCS / SBP / SpO₂ / HR / ETA from a web page `/crew/[id]` (capability link, no install). It creates a new **assessment** on the incident and re-runs `assess()`; a physiological criterion can **upgrade** the band to R. `assess()` already accepts `gcs` and `sbp` (point values are ASSUMPTIONS: GCS<13 → 25, SBP<90 → 20, both RED). An SMS form `SLK1U <id> T<HHMM> GCS<n> SBP<n> SP<n> HR<n> ETA<n> #CC` can be added later with its own vectors; it is **not** in v1.

---

## 3. NSI — NAJDA Severity Index (internal name; the UI says “estimated severity”)

```
raw   = min(50, physics) + everything else
score = round(99 × (1 − e^(−raw / 60)))            0..99, saturating
```
The curve is saturating so the 10th extra risk factor adds less than the 1st. Anchors (tested): raw 36→45, 72→69, 120→86, 85→75, 35→44. **Corrected** (the source docs had slips): raw 90→**77**, 110→**83**, 150→**91**; and the minimum is **0**, not 1.

### 3.1 Points table (exactly what `assess()` does)

| Group | Input | Points | Notes |
|---|---|---|---|
| physics (cap 50) | Δv ≥ 60 / 40–59 / 25–39 km/h | 30 / 20 / 10 | main predictor in the AACN/URGENCY literature |
| physics | peak ≥ 20 g | 5 | |
| physics | rollover | 15 | |
| physics | multiple impacts | 5 | |
| sensor | no response to countdown (`N`) | 15 | proxy for altered consciousness; **counts as physiological evidence** |
| scene **RED** | unresponsive `U` / breathing difficulty `B` / heavy bleeding `H` | 25 / 20 / 20 | RED criteria |
| scene | ejected `E` / death in same vehicle `D` | 20 / 20 | mechanism |
| scene | trapped `X` / child `C` | 15 / 10 | mechanism / special consideration |
| scene | pedestrian **or** motorcycle (`P`/`M`, counted once) | 10 | vulnerable road user |
| scene | fire `F` | 0 | no points; triggers resource hint + burns capability |
| vitals **RED** | SpO₂ < 90 | 20 | RED physiology |
| vitals | HR > 130 or < 50 | 15 | shock/brady **proxy** (not a Vittel criterion); physiological evidence |
| vitals **RED** | GCS < 13 *(crew-entered, JSON only)* | 25 | ASSUMPTION |
| vitals **RED** | SBP < 90 *(crew-entered, JSON only)* | 20 | ASSUMPTION |
| profile (consented) | age ≥ 65 / pregnancy / anticoagulants | 5 each | EMS-judgement modifiers |

Boundaries are pinned by tests (SpO₂ 90 = 0 points, HR 130 and 50 = 0, peak 19 g = 0, Δv 24 = 0).

### 3.2 Bands — Vittel-style two-step logic

```
any RED criterion                          → R   (U, B, H, SpO2<90, GCS<13, SBP<90)
score ≥ 70 AND physiological evidence      → R   (evidence = RED, or N, or abnormal HR)
score ≥ 70 but MECHANISM ONLY              → O   (capped; capNote explains why)
score ≥ 45                                 → O
score ≥ 20                                 → Y
score < 20                                 → G only if "I'm OK"/a witness confirmed no injuries, else U (unknown)
```
Rationale (2021 ACS/NHTSA Field Triage Guideline): **physiology** (red criteria) can trigger the highest level of care; **mechanism** alone is a yellow criterion ("consider"). Switch off with `assess(input, { capMechanismOnly: false })`. ASSUMPTION: the 70/45/20 cut-offs.

### 3.3 Confidence and reasons

- **H** = at least two independent evidence groups contribute (sensor, scene, vitals). **M** = one group with ≥ 3 contributing inputs. **L** otherwise.
- Each extra independent report (distinct `id`) lifts confidence one level (max +2). *Demo moment:* a witness report merged into an auto alert lifts **M → H**.
- `reasons` = the top 3 contributions by points (stable order); each has a stable `code` for i18n (`dv`, `peak_g`, `rollover`, `multi_impact`, `no_response`, `unresponsive`, `breathing`, `bleeding`, `ejected`, `death_in_vehicle`, `trapped`, `child`, `vulnerable_user`, `spo2_low`, `hr_abnormal`, `gcs_low`, `sbp_low`, `age_65`, `pregnant`, `anticoagulant`).
- Always display: band + score + confidence + reasons + **"Estimated risk, not a diagnosis. Confirm by call-back."** (`DISCLAIMER`).

### 3.4 Verified worked examples (`assess()` output)

| Case | Inputs | raw | NSI | Band | Conf | Top reasons |
|---|---|---|---|---|---|---|
| Ex1 auto | Δv 71, 38 g, rollover, no response, SpO₂ 89, HR 124 (not counted) | 85 | **75** | **R** | H | speed drop, SpO₂ 89%, rollover |
| Ex2 witness | pedestrian, trapped, child | 35 | **44** | **Y** | M | trapped, child, pedestrian |
| Moderate | Δv 45, 12 g | 20 | 28 | Y | L | speed drop |
| Minor, confirmed OK | Δv 30 | 10 | 15 | G | L | speed drop |
| Minor, unconfirmed | Δv 30 | 10 | 15 | **U** | L | |
| Mechanism-only | Δv 71, 38 g, rollover, ejected, death, trapped, child, motorcycle | 125 | 87 | **O** (capped) | H | |
| Same + no response | + `N` | 140 | 89 | **R** | H | |

### 3.5 Server-authoritative scoring
The band/score in a packet came from a phone. **Treat it as a hint.** On ingest: decode → `inputFromPacket()` (+ merged reports via `mergePackets()`) → `assess()` → store the *server* result; keep the client value in the report for audit. For both canonical packets the recompute reproduces the phone's value (tested).

---

## 4. Merging duplicate reports

```
same incident ⇔ same id  OR  (distance ≤ 300 m AND |Δt| ≤ 10 min)     ASSUMPTION: tune on field data
```
`shouldMerge(a, b)` and `mergePackets(list)` (pure, tested):
- Same `id` repeated = an **update** of the same report (last wins), *not* an independent report.
- `dv`, `g`, vehicles, persons → **max**; rollover → **any**; flags, kinds → **union** (a danger signal is never lost); vitals → latest present.
- Position anchors on the first sensor (`A`) or manual (`M`) packet, else the first packet.
- `independentReports` = number of distinct ids → feeds confidence.
- In PostGIS: `ST_DWithin(a::geography, b::geography, 300)` plus a time window; do it inside the same transaction as the insert and lock the candidate incident row (`SELECT … FOR UPDATE`) to avoid double incidents under concurrent reports.
- Known limitation: a pile-up (10 simultaneous crashes within 300 m) will merge into one incident. The dispatcher can **split** an incident manually (audit-logged).

---

## 5. Hospital recommendation

```
S(h) = 0.45·T + 0.35·C + 0.15·L + 0.05·A                       (weights = ASSUMPTIONS)
T = max(0, 1 − ETA_min / 60)
C = |required ∩ capabilities(h)| / |required|
L = OK 1.0 · BUSY 0.5 · SATURATED 0.1 · UNKNOWN 0.6            (a status older than 6 h decays to UNKNOWN)
A = level A 1.0 · B 0.5 · C 0.0
```
- **Required capabilities:** R → `ed24, trauma_surgery, ct, icu`; O → `ed24, general_surgery, ct`; Y/G/U → `ed24`. Add `neurosurgery` for flags `U`/`N`, `pediatrics` for `C`, `burns` for `F`.
- **ETA chain:** OSRM `/table` → OpenRouteService matrix → haversine × 1.4 detour at 60 km/h (= 1.4 min/km) flagged `ETA_ESTIMATED`. Facilities with ETA > 90 min are excluded.
- **Gates for band R:** if some Level-A facility is ≤ 60 min away, facilities with C ≥ 0.75 are ranked **first**; otherwise mode = `stabilise_transfer` (best Level-B first, flagged `STABILISE_THEN_TRANSFER`). If nothing is within 90 min: `no_candidate` → "contact SAMU regulation".
- **Always shown:** top-3 with ETA, missing capabilities, status + age, a plain-language explanation; plus `nearestEd` (the closest emergency department regardless of rank) so the dispatcher never loses sight of it. **The dispatcher picks; overrides need a reason.**

### 5.1 Worked example — and a correction to the source plan
Illustrative facilities, band R + flag `N` (needs ed24, trauma_surgery, ct, icu, neurosurgery):

| Facility | ETA | T | C | L | A | **S** |
|---|---|---|---|---|---|---|
| CHU-A (Level A) | 24 | 0.60 | 1.0 | 0.6 (unknown) | 1.0 | **0.76** |
| EPH-B (Level B) | 9 | 0.85 | 0.6 | 1.0 | 0.5 | **0.77** *(the source plan printed 0.71: arithmetic slip)* |
| CHU-C (Level A) | 58 | 0.03 | 1.0 | 0.1 (saturated) | 1.0 | 0.43 |

Raw score alone would rank EPH-B first. **CHU-A is first only because of the C ≥ 0.75 gate** (band R + Level-A within 60 min). Result order: CHU-A, CHU-C, EPH-B — and `nearestEd` = EPH-B. Tell this honestly if asked: *the gate is a clinical policy, the formula alone would favour the closer hospital.* Whether a saturated hospital 58 min away should outrank a stabilisation option 9 min away is exactly the question to put to a SAMU doctor.

---

## 6. Test strategy (what protects the contract)

| Layer | What | Where |
|---|---|---|
| Unit | CRC check value, GSM-7 table, Plus Code vs Google's lib (20k points) | `test/crc8|gsm7|pluscode.test.ts` |
| Property | 5,000 random packets round-trip, pure GSM-7, ≤ 160; worst case fits | `test/dzmsd.test.ts` |
| Mutation | every single-char substitution of both canonical packets is rejected | `test/dzmsd.test.ts` |
| Table | every NSI weight/boundary pinned individually | `test/scoring.test.ts` |
| Golden | committed vectors reproduced exactly by TS | `test/vectors.test.ts` |
| Independent oracle | Python re-implementation agrees on all vectors | `scripts/crosscheck.py` |
| Hook | any edit in `packages/shared` re-runs the tests automatically | `scripts/hooks/after-edit.mjs` |

Changing the protocol on purpose = update this doc → update `crosscheck.py` → `pnpm vectors` → review the vector diff → commit. A regression check we ran: changing rollover from 15 to 16 points is caught by 2 tests.

If your backend dev prefers Python/FastAPI: copy `scripts/crosscheck.py` (strict decoder, encoder, NSI) as the starting domain module and keep running the same vectors.

---

## 7. Security notes (what to say and what to build)

- **CRC ≠ authentication.** A forged SMS with a valid CRC is trivial. Mitigations that fit the hackathon: the gateway number is private to the operations room; webhook secret/HMAC; per-sender rate limit (≤ 3 auto alerts/hour/sender); unconfirmed-auto badge until call-back or a witness merge; every incident needs a human click to dispatch.
- **Production roadmap:** per-device key provisioned at install + a short truncated HMAC tag in v2 (the 47-char worst-case headroom allows ~8–10 chars of tag); operator short code; replay protection with `T` + id.
- **Privacy:** no names, no national ID. The medical profile is a separate opt-in and **never** travels by SMS. Law 18-07 (as amended by Law 25-11 of 2025) treats health data as sensitive: see `11-CORRECTIONS-AND-RISKS.md`.
