import { generateIncidentId, type Source } from '@najda/shared';
import Constants from 'expo-constants';
import { getRandomBytes } from 'expo-crypto';
import { Linking } from 'react-native';
import { postIncident, probeHealth } from '../alert/https';
import { attemptHttps, isDue, isOpen, newItem, type OutboxItem } from '../alert/outbox';
import { buildAlert } from '../alert/packet';
import type { Crash } from '../detector/detector';
import { i18n, type Locale } from '../i18n';
import { useSession } from '../state/session';
import { useSettings } from '../state/settings';
import { onLinkChange } from './connectivity';
import { replayFix } from './drive';
import { sqliteOutbox } from './outbox-sqlite';

/**
 * Alert pipeline (docs/04 §3.3, HTTPS part; P5 adds SMS → composer → GW2 → contacts on the same item):
 *   build packet → persist in the outbox → open the dialler on 14 (never auto-dial) → deliver until ACK or 30 min.
 */
export const EMERGENCY = { civil: '14', civilAlt: '1021', gendarmerie: '1055', police: '17' } as const;

const publish = (item: OutboxItem) => useSession.getState().set({ alerts: { ...useSession.getState().alerts, [item.id]: item } });

export async function openDialler(number: string = EMERGENCY.civil): Promise<boolean> {
  try {
    await Linking.openURL(`tel:${number}`);
    return true;
  } catch {
    return false;
  }
}

export async function raiseAlert(o: { source: Source; crash?: Crash; noResponse?: boolean }): Promise<string> {
  const s = useSession.getState();
  const now = new Date();
  const id = generateIncidentId((n) => getRandomBytes(n));
  const inReplay = s.replay !== null;
  const built = buildAlert({
    id, source: o.source, now,
    fix: inReplay ? replayFix() : s.fix,
    replay: inReplay,
    ...(o.crash && { crash: o.crash }),
    ...(o.noResponse && { noResponse: true }),
    ...(s.battery !== null && { battery: Math.round(s.battery * 100) }),
    lang: i18n.language as Locale,
    appVersion: Constants.expoConfig?.version ?? '0',
  });
  let item = newItem(id, built.wire, built.json, now.getTime(), built.locationAgeMin);
  await sqliteOutbox.put(item); // persisted before anything else can fail
  publish(item);
  if (await openDialler()) {
    item = { ...item, diallerOpenedAt: Date.now() };
    await sqliteOutbox.put(item);
    publish(item);
  }
  void deliverDue();
  return id;
}

let running = false;
/** Run every due delivery attempt once. Safe to call often (serialised). */
export async function deliverDue(force = false): Promise<void> {
  if (running) return;
  running = true;
  try {
    const { serverUrl, ingestKey } = useSettings.getState();
    for (const it of Object.values(useSession.getState().alerts)) {
      if (!(force ? isOpen(it) : isDue(it, Date.now()))) continue;
      publish(it); // "sending…" is derived from state + nextAt; keep UI fresh
      const next = await attemptHttps(it, {
        now: Date.now,
        probe: () => probeHealth(fetch, serverUrl),
        post: (json) => postIncident(fetch, serverUrl, ingestKey, json),
      });
      await sqliteOutbox.put(next);
      publish(next);
    }
  } finally {
    running = false;
  }
}

let loop: ReturnType<typeof setInterval> | null = null;
/** Load the persisted outbox (alerts survive a kill) and keep delivering; retry at once when the link comes back. */
export async function startOutbox() {
  if (loop) return;
  const items = await sqliteOutbox.list();
  useSession.getState().set({ alerts: Object.fromEntries(items.map((i) => [i.id, i])) });
  loop = setInterval(() => void deliverDue(), 1_000);
  onLinkChange((link) => { if (link === 'online') void deliverDue(true); });
}
