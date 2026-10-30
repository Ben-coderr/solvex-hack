import * as Battery from 'expo-battery';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { Accelerometer, Gyroscope } from 'expo-sensors';
import { createDetector, type Detector, type DetectorEvent } from '../detector/detector';
import type { TraceName } from '../detector/synth';
import { parseCsv } from '../detector/trace';
import { i18n } from '../i18n';
import { BUNDLED_TRACES } from '../replay/bundled-traces';
import { startReplay, type ReplayHandle, type ReplayRate } from '../replay/engine';
import { useSession } from '../state/session';
import { LOCATION_TASK, onTaskLocation } from './location-task';

/**
 * Drive mode (M2): ONE detector fed either by the live sensors (foreground, keep-awake, location foreground
 * service) or by a replayed trace. A CONFIRM opens the countdown. Everything is torn down by stopDrive().
 */
const SENSOR_MS = 20; // ~50 Hz requested; the real rate is device-dependent
const LOW_BATTERY_MS = 40; // battery < 10 %: reduce sampling, keep detection (docs/03 §6)
const UI_MS = 250;
/** Replay with no usable GPS fix (indoors, on stage): the spec's example spot, labelled REPLAY everywhere. */
export const REPLAY_FALLBACK_FIX = { lat: 36.47213, lon: 2.82871, accM: 25 } as const;

let detector: Detector | null = null;
let replay: ReplayHandle | null = null;
let cleanups: (() => void)[] = [];
let lastUi = 0;

const session = () => useSession.getState();

function onLocation(loc: Location.LocationObject) {
  const sp = loc.coords.speed;
  session().set({
    fix: {
      lat: loc.coords.latitude, lon: loc.coords.longitude,
      ...(loc.coords.accuracy !== null && { accM: loc.coords.accuracy }),
      at: loc.timestamp,
      speedKmh: sp !== null && sp >= 0 ? sp * 3.6 : null,
    },
  });
}

function handle(events: DetectorEvent[]) {
  for (const e of events) {
    if (e.type !== 'confirm') continue;
    replay?.stop();
    session().set({ pendingCrash: e.crash, detector: detector!.snapshot() });
    router.push('/countdown');
  }
}

function pushUi(force = false) {
  const now = Date.now();
  if (!detector || (!force && now - lastUi < UI_MS)) return;
  lastUi = now;
  session().set({ detector: detector.snapshot() });
}

async function startLocation(): Promise<'running' | 'fallback' | 'denied'> {
  let perm = await Location.getForegroundPermissionsAsync();
  if (!perm.granted && perm.canAskAgain) perm = await Location.requestForegroundPermissionsAsync();
  session().set({ perms: { ...session().perms, location: perm.granted ? 'granted' : 'denied' } });
  if (!perm.granted) return 'denied';
  cleanups.push(onTaskLocation(onLocation));
  try {
    await Location.startLocationUpdatesAsync(LOCATION_TASK, {
      accuracy: Location.Accuracy.BestForNavigation,
      timeInterval: 1_000,
      distanceInterval: 0,
      foregroundService: { notificationTitle: i18n.t('drive.notifTitle'), notificationBody: i18n.t('drive.notifBody'), killServiceOnDestroy: true },
    });
    cleanups.push(() => void Location.stopLocationUpdatesAsync(LOCATION_TASK).catch(() => {}));
    return 'running';
  } catch {
    // no foreground service (notifications refused on some OEMs, or web): foreground-only watch, say so on screen
    const sub = await Location.watchPositionAsync({ accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1_000, distanceInterval: 0 }, onLocation);
    cleanups.push(() => sub.remove());
    return 'fallback';
  }
}

async function startSensors(): Promise<boolean> {
  const [acc, gyr] = await Promise.all([Accelerometer.isAvailableAsync(), Gyroscope.isAvailableAsync()]);
  if (!acc) return false;
  let gyro = { x: 0, y: 0, z: 0 };
  Accelerometer.setUpdateInterval(SENSOR_MS);
  if (gyr) {
    Gyroscope.setUpdateInterval(SENSOR_MS);
    const g = Gyroscope.addListener((m) => { gyro = m; });
    cleanups.push(() => g.remove());
  }
  const a = Accelerometer.addListener((m) => {
    if (!detector) return;
    handle(detector.push({ t: Date.now(), ax: m.x, ay: m.y, az: m.z, gx: gyro.x, gy: gyro.y, gz: gyro.z, speed: session().fix?.speedKmh ?? null }));
    pushUi();
  });
  cleanups.push(() => a.remove());
  return true;
}

async function startBattery() {
  try {
    const set = (level: number) => {
      session().set({ battery: level });
      const ms = level >= 0 && level < 0.1 ? LOW_BATTERY_MS : SENSOR_MS;
      Accelerometer.setUpdateInterval(ms);
      Gyroscope.setUpdateInterval(ms);
    };
    set(await Battery.getBatteryLevelAsync());
    const sub = Battery.addBatteryLevelListener(({ batteryLevel }) => set(batteryLevel));
    cleanups.push(() => sub.remove());
  } catch {
    session().set({ battery: null });
  }
}

export async function startDrive(opts: { replay?: { name: TraceName; rate: ReplayRate } } = {}) {
  await stopDrive();
  detector = createDetector();
  await activateKeepAwakeAsync('drive').catch(() => {});
  cleanups.push(() => deactivateKeepAwake('drive'));

  if (opts.replay) {
    const { name, rate } = opts.replay;
    session().set({ drive: { active: true, live: false, service: 'off', error: null }, replay: { name, rate, progress: 0 } });
    // a real fix is still used for the coordinates when the phone has one
    void Location.getForegroundPermissionsAsync().then(async (p) => {
      if (!p.granted) return;
      const last = await Location.getLastKnownPositionAsync().catch(() => null);
      if (last) onLocation(last);
    });
    replay = startReplay({
      samples: parseCsv(BUNDLED_TRACES[name]),
      detector,
      rate,
      onTick: (_s, snap, progress) => session().set({ detector: snap, replay: { name, rate, progress } }),
      onEvent: (e) => handle([e]),
    });
    pushUi(true);
    return;
  }

  session().set({ drive: { active: true, live: true, service: 'off', error: null }, replay: null });
  const [loc, sensors] = await Promise.all([startLocation(), startSensors(), startBattery()]);
  session().set({
    drive: {
      active: true, live: true,
      service: loc === 'running' ? 'running' : loc === 'fallback' ? 'fallback' : 'off',
      error: loc === 'denied' ? 'location_denied' : sensors ? null : 'no_sensors',
    },
  });
  pushUi(true);
}

export async function stopDrive() {
  replay?.stop();
  replay = null;
  cleanups.splice(0).reverse().forEach((c) => c());
  detector = null;
  session().set({
    drive: { active: false, live: false, service: 'off', error: null },
    replay: null,
    detector: { state: 'IDLE', speed: null, g: 1, armProgress: 0 },
  });
}

/** The countdown screen reports how it ended. */
export function resolveCountdown(outcome: 'ok' | 'alerted') {
  detector?.resolve(outcome, Date.now());
  session().set({ pendingCrash: null });
  pushUi(true);
}

/** Coordinates for an alert raised during a replay: the real fix if fresh, else the labelled fallback spot. */
export function replayFix() {
  const f = session().fix;
  if (f && Date.now() - f.at < 10 * 60_000 && (f.accM ?? 999) <= 100) return f;
  return { ...REPLAY_FALLBACK_FIX, at: Date.now(), speedKmh: null };
}
