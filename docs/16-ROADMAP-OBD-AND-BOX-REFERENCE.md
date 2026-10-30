# 16 — Roadmap: the vehicle link (OBD) and the IoT box — reference design, schematics only

> **Decision (team, 2026-10-30):** *the phone sensors are the main path; ESP32 and OBD are secondary.* This file keeps them as an **honest roadmap** with enough engineering detail to answer a jury, and **nothing to build in the 48 hours** except the simulated `BOX` replay (§4), which is already tested.
> No ESP32 builder and no parts on the team → no wiring to follow here, only **block diagrams and firmware flow**. Verdicts and sources: docs/12 §4–5. I could not read the two repos (docs/12 §7 explains how to give access), so what follows is built from verified facts, not from your OBD pack.

## 1. Where the two add-ons sit in the story
```
Stage 0  PHONE (now)            accelerometer ±8–16 g (saturates) + gyro + GPS + user countdown   → the product
Stage 1  VEHICLE LINK (lite)    BLE OBD dongle gives wheel speed 5–10 Hz (sharper Δv than 1 Hz GPS)  → roadmap, low value
Stage 2  BOX  (plug-in device)  ±200 g IMU + GNSS + LTE + backup power; sends the SAME packet     → roadmap, the real answer to saturation
Stage 3  VEHICLE-NATIVE         eCall-style integration with manufacturers / importers               → vision, needs partners
```
`docs/diagrams/04-sources-to-packet.svg` shows the same idea: every source ends in the **same DZ-MSD packet**, so adding a source never changes the server.

## 2. Vehicle link (OBD-II) — what is true, what the old plan got wrong
| Topic | Fact (sources in docs/12 §9) | Old-plan error to avoid |
|---|---|---|
| Vehicle speed | Mode 01 **PID `0D`**, 1 byte = km/h | "PID 0x00A", "mi/h" |
| Engine speed | **PID `0C`**, `((256·A)+B)/4` rpm (1/4 rpm per bit) | emulator sent raw rpm without the ×4 scaling |
| Airbag | **No standard PID**; deployment is OEM-specific | "airbag deployed over OBD" |
| DTC `B0001` | In the commonly published SAE-style code lists it is the **driver frontal stage-1 deployment-control circuit/fault** in the SRS module — a *fault code*, not "airbag deployed"; basic scanners often skip body codes. `B0001` encodes as bytes `80 01` (system bits `10` = B) | "B0001 = airbag deployed" |
| Mode 03 | Request `03`, positive response starts `43`, then 2-byte DTCs | wrong response format in the emulator |
| Adapter | ELM327 clones (v1.4 bugs), needs `AT` init (`ATZ`, `ATE0`, `ATSP0` …); BLE vs Classic matters for `react-native-ble-plx` (BLE only) | no init sequence in the emulator |
| Power | Pin 16 is permanent +12 V → sleep logic | — |
| Business | Automatic (OBD crash alerts) shut down on 28 May 2020 | — |
**If you still want it** (≥ 6 h slack **and** a BLE dongle that pairs in < 1 min): *Vehicle link lite* = read `0D` at the best rate the dongle allows, show it in Drive mode, feed the **same detector** as the speed series. Nothing else. Measure the real rate before quoting it (the old "100 ms/parameter" figure was never measured on a dongle).

## 3. The box — reference design (block diagram: `docs/diagrams/05-roadmap-box-blocks.svg`)
```
 12/24 V ──► surge/load-dump protection ──► buck 5 V/3.3 V ──┬──► MCU (ESP32-class: BLE/Wi-Fi for provisioning)
 (OBD pin 16 or fuse tap)                                      │      ├─ SPI/I²C ─► high-g accelerometer (ADXL375-class, ±200 g)
                                         backup cell/supercap ─┘      ├─ I²C ─────► low-g 6-axis IMU (orientation, rollover)
                                            (keeps the radio alive    ├─ UART ────► LTE Cat-1/Cat-M modem + GNSS  ◄── SIM
                                             ~a minute after a cut)   ├─ (opt.) CAN/OBD transceiver ► wheel speed (stage 1)
                                                                      └─ status LED + a "cancel / I'm OK" button, buzzer
```
- **Why it exists:** a purpose-built ±200 g sensor sees the real pulse (36–46 g, ~100 ms in full-frontal tests — docs/13 §2.1), so `G` is a *measurement* and Δv can be *integrated* (the phone must use GPS). The test in `packages/detector` (`frontal_45` at ±200 g) shows the difference: `G = 32` unclipped, `sensorLimited = false`.
- **Modem:** choose **LTE**; Algeria plans to retire 2G/3G by 2029 ([algerie-eco](https://algerie-eco.com/2026/04/09/algerie-la-desactivation-des-reseaux-2g-et-3g-prevue-en-2029/)). Check the band list of the module against the operators' LTE bands **before** buying.
- **Firmware flow (same rules as the phone):** sample high-g IMU at the highest rate the part supports → ring buffer → trigger (≥ 4 g) → window → gates (speed from GNSS/OBD, duration, stop) → countdown with the button/buzzer → build the packet with a **C port of `encodeDzmsd`** → send via modem (HTTPS first, SMS fallback). **Acceptance test: the 302 valid + 134 invalid golden vectors** from `packages/shared/test-vectors` must produce byte-identical output (the Python cross-check is a template for the port).
- **Source letter:** a new `D` (device) letter and a rule "G may exceed phone range" = **protocol v1.1**, via the `najda-protocol` procedure only (docs/12 §6). Not applied in this build.
- **Compliance (product, not demo):** Executive Decree 26-97 covers equipment homologation incl. IoT modules, GSMA TAC for cellular devices and a label before sale ([summary](https://algeriatech.news/arpce-decree-26-97-equipment-homologation-2026/) — read the Official Gazette; ask ARPCE whether a prototype is exempt). Automotive EMC/ISO 7637 transients, battery transport rules and warranty/liability are further work.
- **Indicative parts list (no prices, none validated):** MCU module (ESP32-class) · ADXL375-class high-g accelerometer breakout · 6-axis IMU · LTE module with GNSS and antennas · nano-SIM holder · 12/24 V→5 V automotive buck with TVS · supercap or small Li cell + charger · CAN transceiver (optional) · enclosure.
- **Prior art:** off-the-shelf OBD telematics boards exist (Freematics ONE+: ESP32, GNSS, IMU, optional cellular, open-source firmware) and ESP32 + accelerometer + GSM "accident detectors" are a common student project. The box is **not** the innovation; the **system** is.

## 4. What we actually do in the 48 hours: `BOX (simulated)`
`pnpm --filter @najda/detector traces` already writes `frontal_45_r200.csv` and `rollover_71_r200.csv` (range ±200 g, manifest label **REPLAY · SYNTHETIC · BOX (simulated, roadmap)**). In the app/dashboard add a source selector `Phone | Box (simulated)` on the `/phones` page. On stage: *"This is what a ±200 g sensor would send — 32 g, not 'at least 16 g'. Same packet, same server."* One slide, 2–3 h of work, zero risk to the core.

## 5. GO criteria for building real hardware (all must be true — docs/12 §5.3)
1. Gate G4 passed before H26 and the hero flow is stable. 2. A named teammate has built an ESP32 project **and the parts are in hand** (accelerometer, modem, SIM with credit, power). 3. The firmware reuses our contract and the golden vectors. 4. It cannot delay feature freeze (H36). Otherwise: the simulated box and the roadmap slide.

## 6. What to say about the roadmap (and what not)
- **Say:** "Phones are the sensor today. They saturate, so a plug-in box with a ±200 g sensor is the next source; the packet does not change. Vehicle-speed over OBD can sharpen Δv. These are roadmap items."
- **Don't say:** the box is built/tested/certified/approved; OBD reads airbag status; any cost or price for a box; any claim about vehicle coverage in Algeria (get the fleet mix from ONS first).
