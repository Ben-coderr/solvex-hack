import { generateIncidentId, type Source } from '@najda/shared';
import type { PacketHints } from '@najda/detector';
import Constants from 'expo-constants';
import { getRandomBytes } from 'expo-crypto';
import * as SMS from 'expo-sms';
import { Linking } from 'react-native';
import { postIncident, probeHealth } from '../alert/https';
import { attemptHttps, isDue, isOpen, newItem, type OutboxItem } from '../alert/outbox';
import { buildAlert } from '../alert/packet';
import { i18n, type Locale } from '../i18n';
import { useSession } from '../state/session';
import { useSettings } from '../state/settings';
import { onLinkChange } from './connectivity';
import { replayFix } from './drive';
import { sqliteOutbox } from './outbox-sqlite';

/**
 * Alert pipeline (docs/04 §3.3, cut to docs/17 §2):
 *   build packet → persist in the outbox → open the dialler on 14 (never auto-dial) → HTTPS until ACK or 30 min;
 *   SMS = the system composer pre-filled with the packet to GW1, one tap from the status screen (the person sends).
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

export async function raiseAlert(o: { source: Source; hints?: PacketHints; noResponse?: boolean }): Promise<string> {
  const s = useSession.getState();
  const now = new Date();
  const id = generateIncidentId((n) => getRandomBytes(n));
  const inReplay = s.replay !== null;
  const built = buildAlert({
    id, source: o.source, now,
    fix: inReplay ? replayFix() : s.fix,
    replay: inReplay,
    ...(o.hints && { hints: o.hints }),
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

export type SmsOpen = 'opened' | 'no_gateway' | 'unavailable';

/**
 * Opens the system SMS composer with the packet pre-filled to GW1 (GW2 if GW1 is empty). The person presses Send:
 * Android never tells us whether it went, so the status screen says "composer opened", not "sent".
 */
export async function openSmsComposer(id: string): Promise<SmsOpen> {
  const item = useSession.getState().alerts[id];
  const { gw1, gw2 } = useSettings.getState();
  const to = gw1 || gw2;
  if (!item) return 'unavailable';
  if (!to) return 'no_gateway';
  if (!(await SMS.isAvailableAsync().catch(() => false))) return 'unavailable';
  try {
    await SMS.sendSMSAsync([to], item.wire);
  } catch {
    return 'unavailable';
  }
  // re-read: HTTPS delivery may have moved on while the composer was open
  const latest = useSession.getState().alerts[id] ?? item;
  const next = { ...latest, sms: { composerOpenedAt: Date.now(), to } };
  await sqliteOutbox.put(next);
  publish(next);
  return 'opened';
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
      const done = await attemptHttps(it, {
        now: Date.now,
        probe: () => probeHealth(fetch, serverUrl),
        post: (json) => postIncident(fetch, serverUrl, ingestKey, json),
      });
      // keep what other channels recorded meanwhile (the SMS composer may have been opened during the attempt)
      const next = { ...done, sms: useSession.getState().alerts[it.id]?.sms ?? done.sms };
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
