import { parseCsv, type Decision } from '@sellekni/detector';
import * as Battery from 'expo-battery';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { Accelerometer, Barometer, Gyroscope } from 'expo-sensors';
import { LOW_BATTERY_SENSOR_INTERVAL_MS, SENSOR_INTERVAL_MS } from '../config';
import { createDetectorHost, createSensorClock, IDLE_SNAPSHOT, RAD_TO_DEG, toSample, type DetectorHost } from '../detector/adapter';
import { createSpeedEstimator } from '../detector/speed';
import { BUNDLED_TRACES, type TraceName } from '../replay/bundled-traces';
import { startReplay, type ReplayHandle, type ReplayRate } from '../replay/engine';
import { NO_TELEMETRY, useSession, type SensorLive, type Telemetry } from '../state/session';
import { useSettings } from '../state/settings';
import { readAccelerometerRangeG } from './sensor-info';

/**
 * Drive mode (M2): ONE detector host (src/detector/adapter.ts over @sellekni/detector) fed either by the live sensors
 * or by a replayed trace. FOREGROUND ONLY (docs/17 §2): screen on + keep-awake, no location service, because
 * expo-sensors stops in the background and Android 14 needs a declared service type. An ALERT opens the countdown.
 */
const UI_MS = 250;
/** Replay with no usable GPS fix (indoors, on stage): the spec's example spot, labelled REPLAY everywhere. */
export const REPLAY_FALLBACK_FIX = { lat: 36.47213, lon: 2.82871, accM: 25 } as const;

let host: DetectorHost | null = null;
let replay: ReplayHandle | null = null;
let cleanups: (() => void)[] = [];
let lastUi = 0;
const speed = createSpeedEstimator();

/** live readings, published with the detector snapshot at most every UI_MS */
const LIVE_MS = 2_000;
const tel = {
  has: { accelerometer: false, gyroscope: false, gps: false, barometer: false },
  at: { accelerometer: 0, gyroscope: 0, gps: 0, barometer: 0 },
  accG: null as number | null, peakG: null as number | null, gyroDps: null as number | null, hpa: null as number | null,
  speedSource: null as Telemetry['speedSource'],
};
function resetTelemetry() {
  tel.has = { accelerometer: false, gyroscope: false, gps: false, barometer: false };
  tel.at = { accelerometer: 0, gyroscope: 0, gps: 0, barometer: 0 };
  tel.accG = tel.peakG = tel.gyroDps = tel.hpa = null;
  tel.speedSource = null;
}
function telemetry(now: number): Telemetry {
  const st = (k: keyof typeof tel.has): SensorLive => (!tel.has[k] ? 'missing' : now - tel.at[k] <= LIVE_MS ? 'live' : 'waiting');
  return {
    sensors: { accelerometer: st('accelerometer'), gyroscope: st('gyroscope'), gps: st('gps'), barometer: st('barometer') },
    accG: tel.accG, peakG: tel.peakG, gyroDps: tel.gyroDps, hpa: tel.hpa, speedSource: tel.speedSource,
  };
}
/** the "peak g" gauge starts again (e.g. after shaking the phone to check the sensor) */
export function resetPeak() {
  tel.peakG = tel.accG;
  pushUi(true);
}

const session = () => useSession.getState();

function pushUi(force = false) {
  const now = Date.now();
  if (!force && now - lastUi < UI_MS) return;
  lastUi = now;
  const live = session().drive.live;
  session().set({ ...(host && { detector: host.snapshot() }), ...(live && { telemetry: telemetry(now) }) });
}

function handle(decisions: readonly Decision[]) {
  for (const d of decisions) {
    if (d.kind === 'rejected') {
      session().set({ lastRejection: { at: Date.now(), rejected: d.rejected } });
      continue;
    }
    replay?.stop();
    const r = session().replay;
    session().set({ pending: { decision: d, rangeG: host!.detector.rangeG }, detector: host!.snapshot(), ...(r && { replay: { ...r, ended: true } }) });
    router.push('/countdown');
  }
}

/**
 * The accelerometer range the detector must use (Sensor Lab T1). A value typed by hand wins; otherwise Android's
 * own figure (native module), saved so the Settings and the Sensor Lab show where it came from.
 */
export function resolveRangeG(): number | null {
  const s = useSettings.getState();
  if (s.rangeSource === 'manual' && s.rangeG !== null) return s.rangeG;
  const fromDevice = readAccelerometerRangeG();
  if (fromDevice !== null) {
    if (fromDevice !== s.rangeG || s.rangeSource !== 'device') s.set({ rangeG: fromDevice, rangeSource: 'device' });
    return fromDevice;
  }
  return s.rangeG;
}

function onLocation(loc: Location.LocationObject, feedDetector: boolean) {
  const { latitude: lat, longitude: lon, accuracy, speed: sp } = loc.coords;
  // Doppler speed when Android gives it, else computed from the fixes (src/detector/speed.ts)
  const v = feedDetector ? speed.update({ lat, lon, accM: accuracy, at: loc.timestamp, speedMps: sp }) : null;
  session().set({
    fix: { lat, lon, ...(accuracy !== null && { accM: accuracy }), at: loc.timestamp, speedKmh: v?.kmh ?? (sp !== null && sp >= 0 ? sp * 3.6 : null) },
  });
  if (!feedDetector) return;
  tel.has.gps = true;
  tel.at.gps = Date.now();
  tel.speedSource = v?.source ?? null;
  // the detector wants the ARRIVAL time on the phone (GPS latency stays inside it), on the samples' time base
  if (v && host) handle(host.pushGps({ t: Date.now(), speedKmh: v.kmh }));
  pushUi();
}

async function startLocation(): Promise<boolean> {
  let perm = await Location.getForegroundPermissionsAsync();
  if (!perm.granted && perm.canAskAgain) perm = await Location.requestForegroundPermissionsAsync();
  session().set({ perms: { ...session().perms, location: perm.granted ? 'granted' : 'denied' } });
  if (!perm.granted) return false;
  const sub = await Location.watchPositionAsync(
    { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1_000, distanceInterval: 0 },
    (loc) => onLocation(loc, true),
  );
  cleanups.push(() => sub.remove());
  return true;
}

function setSensorInterval(ms: number) {
  Accelerometer.setUpdateInterval(ms);
  Gyroscope.setUpdateInterval(ms);
}

async function startSensors(): Promise<boolean> {
  const [acc, gyr, baro] = await Promise.all([
    Accelerometer.isAvailableAsync(), Gyroscope.isAvailableAsync(), Barometer.isAvailableAsync().catch(() => false),
  ]);
  tel.has.accelerometer = acc;
  tel.has.gyroscope = gyr;
  tel.has.barometer = baro;
  if (baro) {
    // display only (the detector has no pressure input): shows the sensor is alive
    Barometer.setUpdateInterval(500);
    const b = Barometer.addListener((m) => { tel.hpa = m.pressure; tel.at.barometer = Date.now(); });
    cleanups.push(() => b.remove());
  }
  if (!acc) return false;
  const clock = createSensorClock();
  let gyro = { x: 0, y: 0, z: 0 }; // no gyroscope: rule (c) rollover cannot fire, (a) and (b) still can
  setSensorInterval(SENSOR_INTERVAL_MS);
  if (gyr) {
    const g = Gyroscope.addListener((m) => {
      gyro = m;
      tel.gyroDps = Math.hypot(m.x, m.y, m.z) * RAD_TO_DEG;
      tel.at.gyroscope = Date.now();
    });
    cleanups.push(() => g.remove());
  }
  const a = Accelerometer.addListener((m) => {
    const g = Math.hypot(m.x, m.y, m.z);
    tel.accG = g;
    tel.peakG = Math.max(tel.peakG ?? 0, g);
    tel.at.accelerometer = Date.now();
    if (!host) return;
    handle(host.pushSample(toSample(clock.toMs(m.timestamp, Date.now()), m, gyro)));
    pushUi();
  });
  cleanups.push(() => a.remove());
  return true;
}

async function startBattery() {
  try {
    const set = (level: number) => {
      session().set({ battery: level });
      setSensorInterval(level >= 0 && level < 0.1 ? LOW_BATTERY_SENSOR_INTERVAL_MS : SENSOR_INTERVAL_MS);
    };
    set(await Battery.getBatteryLevelAsync());
    const sub = Battery.addBatteryLevelListener(({ batteryLevel }) => set(batteryLevel));
    cleanups.push(() => sub.remove());
  } catch {
    session().set({ battery: null });
  }
}

async function startReplayDrive(name: TraceName, rate: ReplayRate) {
  const tr = BUNDLED_TRACES[name];
  // a replay simulates THAT trace's sensor (±16 g phone, or the ±200 g simulated BOX), not this phone's
  host = createDetectorHost(tr.rangeG);
  session().set({ drive: { active: true, live: false, error: null }, replay: { name, rate, progress: 0, box: tr.box, ended: false } });
  // the coordinates still come from this phone when it has a fix (never fed to the detector during a replay)
  void Location.getForegroundPermissionsAsync().then(async (p) => {
    if (!p.granted) return;
    const last = await Location.getLastKnownPositionAsync().catch(() => null);
    if (last) onLocation(last, false);
  });
  replay = startReplay({
    trace: parseCsv(tr.csv),
    host,
    rate,
    onDecision: (d) => handle([d]),
    onTick: (progress) => {
      const r = session().replay;
      if (r) session().set({ replay: { ...r, progress } });
      pushUi();
    },
    onEnd: () => {
      const r = session().replay;
      if (r) session().set({ replay: { ...r, progress: 1, ended: true } });
      pushUi(true);
    },
  });
  pushUi(true);
}

export async function startDrive(opts: { replay?: { name: TraceName; rate: ReplayRate } } = {}) {
  await stopDrive();
  await activateKeepAwakeAsync('drive').catch(() => {});
  cleanups.push(() => deactivateKeepAwake('drive'));
  if (opts.replay) return startReplayDrive(opts.replay.name, opts.replay.rate);

  const rangeG = resolveRangeG();
  host = rangeG === null ? null : createDetectorHost(rangeG);
  resetTelemetry();
  speed.reset();
  session().set({ drive: { active: true, live: true, error: rangeG === null ? 'no_range' : null }, replay: null, telemetry: NO_TELEMETRY });
  // location runs even without a detector (SOS needs the position); sensors run even when detection is off, so the
  // live panel can show they work (an UNSUPPORTED host simply ignores the samples)
  const [located, sensors] = await Promise.all([startLocation(), startSensors(), startBattery()]);
  const error = rangeG === null ? 'no_range' : !located ? 'location_denied' : !sensors ? 'no_sensors' : null;
  session().set({ drive: { active: true, live: true, error } });
  if (!host) session().set({ detector: IDLE_SNAPSHOT });
  pushUi(true);
  // a sensor that stops reporting must show as "waiting" even when nothing else refreshes the screen
  const tick = setInterval(() => pushUi(true), 1_000);
  cleanups.push(() => clearInterval(tick));
}

export async function stopDrive() {
  replay?.stop();
  replay = null;
  cleanups.splice(0).reverse().forEach((c) => c());
  host = null;
  session().set({ drive: { active: false, live: false, error: null }, replay: null, detector: IDLE_SNAPSHOT, telemetry: NO_TELEMETRY, lastRejection: null });
}

/** The countdown ended (I'm OK, or an alert was sent): the detector resumes watching. */
export function resolveCountdown() {
  host?.acknowledge();
  session().set({ pending: null });
  pushUi(true);
}

/** Coordinates for an alert raised during a replay: the real fix if fresh, else the labelled fallback spot. */
export function replayFix() {
  const f = session().fix;
  if (f && Date.now() - f.at < 10 * 60_000 && (f.accM ?? 999) <= 100) return f;
  return { ...REPLAY_FALLBACK_FIX, at: Date.now(), speedKmh: null };
}
