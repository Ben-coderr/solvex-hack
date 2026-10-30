import { parseCsv, type Decision } from '@najda/detector';
import * as Battery from 'expo-battery';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { Accelerometer, Gyroscope } from 'expo-sensors';
import { LOW_BATTERY_SENSOR_INTERVAL_MS, SENSOR_INTERVAL_MS } from '../config';
import { createDetectorHost, createSensorClock, IDLE_SNAPSHOT, toGpsFix, toSample, type DetectorHost } from '../detector/adapter';
import { BUNDLED_TRACES, type TraceName } from '../replay/bundled-traces';
import { startReplay, type ReplayHandle, type ReplayRate } from '../replay/engine';
import { useSession } from '../state/session';
import { useSettings } from '../state/settings';
import { readAccelerometerRangeG } from './sensor-info';

/**
 * Drive mode (M2): ONE detector host (src/detector/adapter.ts over @najda/detector) fed either by the live sensors
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

const session = () => useSession.getState();

function pushUi(force = false) {
  const now = Date.now();
  if (!host || (!force && now - lastUi < UI_MS)) return;
  lastUi = now;
  session().set({ detector: host.snapshot() });
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
  const sp = loc.coords.speed;
  session().set({
    fix: {
      lat: loc.coords.latitude, lon: loc.coords.longitude,
      ...(loc.coords.accuracy !== null && { accM: loc.coords.accuracy }),
      at: loc.timestamp,
      speedKmh: sp !== null && sp >= 0 ? sp * 3.6 : null,
    },
  });
  if (!feedDetector || !host) return;
  // the detector wants the ARRIVAL time on the phone (GPS latency stays inside it), on the samples' time base
  const fix = toGpsFix(sp, Date.now());
  if (fix) handle(host.pushGps(fix));
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
  const [acc, gyr] = await Promise.all([Accelerometer.isAvailableAsync(), Gyroscope.isAvailableAsync()]);
  if (!acc) return false;
  const clock = createSensorClock();
  let gyro = { x: 0, y: 0, z: 0 }; // no gyroscope: rule (c) rollover cannot fire, (a) and (b) still can
  setSensorInterval(SENSOR_INTERVAL_MS);
  if (gyr) {
    const g = Gyroscope.addListener((m) => { gyro = m; });
    cleanups.push(() => g.remove());
  }
  const a = Accelerometer.addListener((m) => {
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
  session().set({ drive: { active: true, live: true, error: rangeG === null ? 'no_range' : null }, replay: null });
  // location runs even without a detector: SOS needs the position
  const [located, sensors] = await Promise.all([
    startLocation(),
    host?.detector.supported ? startSensors() : Promise.resolve(true),
    startBattery(),
  ]);
  const error = rangeG === null ? 'no_range' : !located ? 'location_denied' : !sensors ? 'no_sensors' : null;
  session().set({ drive: { active: true, live: true, error } });
  if (host) pushUi(true);
  else session().set({ detector: IDLE_SNAPSHOT });
}

export async function stopDrive() {
  replay?.stop();
  replay = null;
  cleanups.splice(0).reverse().forEach((c) => c());
  host = null;
  session().set({ drive: { active: false, live: false, error: null }, replay: null, detector: IDLE_SNAPSHOT, lastRejection: null });
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
