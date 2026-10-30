# @sellekni/detector — the phone crash detector (reference implementation)

Pure TypeScript, no React, no Expo imports. The same code runs on the phone (live sensors) and in tests (synthetic or recorded traces).
Design, physics, parameters and what the tests do and do not prove: **`docs/13-PHONE-SENSING-PLAN.md`**. Picture: `docs/diagrams/03-detector-pipeline.svg`.

> Everything here is validated on **synthetic** traces only. No real-road detection rate exists. Do not quote one.

## Use it (mobile, in `apps/mobile/src/detector`)
```ts
import { Detector, toPacketHints } from '@sellekni/detector';

const det = new Detector(rangeG);          // rangeG = the sensor's real max range in g (Sensor Lab T1)
if (!det.supported) { /* range < 8 g: offer SOS + witness mode only and say why */ }

accelerometer.addListener(({ x, y, z, timestamp }) => {
  // expo-sensors: g units, gravity included. Convert gyro to deg/s. t in ms.
  const out = det.pushSample({ t: timestamp, ax: x, ay: y, az: z, gx, gy, gz });
  handle(out);
});
location.watch(({ speedMps, arrivalMs }) => handle(det.pushGps({ t: arrivalMs, speedKmh: speedMps * 3.6 })));

function handle(decisions) {
  for (const d of decisions) {
    if (d.kind === 'alert') {
      startCountdown(d.reasons);               // machine keys -> ar/fr/en sentences
      const hints = toPacketHints(d, rangeG);  // { G, D, RO, sensorLimited } -> encodeDzmsd()
    } else {
      logForSensorLab(d.rejected);             // why it was rejected
    }
  }
}
// after the countdown ends (I'm OK or alert sent):  det.acknowledge()
// show a warning if !det.rateOk (measured rate below 45 Hz)
```
`t` on a GPS fix is the **arrival time on the phone**, so GPS latency is already inside it. Never compute Δv from a clipped accelerometer: the detector takes it from GPS and `toPacketHints` puts `G = min(peak, range)`.

## Commands
```bash
pnpm --filter @sellekni/detector test      # 21 tests: scenarios, ablations, rate and GPS-lag sweeps, CSV round trip, packet integration
pnpm --filter @sellekni/detector report    # the scenario x sensor-range table (docs/13 section 4)
pnpm --filter @sellekni/detector traces    # writes 22 CSVs + manifest.json to traces/ (replay and Sensor Lab format)
pnpm --filter @sellekni/detector exec tsx scripts/example-packet.ts   # detector decision -> packet, ≤ 160 chars
```

## Trace format (the Sensor Lab records the same)
`t_ms,ax,ay,az,gx,gy,gz,speed_kmh`, with `speed_kmh` filled only on rows where a GPS fix arrives. Files are named `<scenario>_r<range>.csv`; `_r200` files are the simulated **BOX** (±200 g, roadmap) and must be labelled `REPLAY · SYNTHETIC · BOX (simulated)` on screen.

## Change rules
- All thresholds live in `PARAMS` and are assumptions. Change them only with evidence, and write the date and the evidence in `DECISIONS.md`.
- A new scenario goes in `src/synth.ts` with its expected outcome, then in the report. A new gate needs an ablation test that shows the trap it stops.
- The packet contract (`@sellekni/shared`) is not touched from here. Richer cues stay on the phone (docs/13 §3.3).
