import { generateIncidentId, type Source } from '@sellekni/shared';
import type { PacketHints } from '@sellekni/detector';
import Constants from 'expo-constants';
import { getRandomBytes } from 'expo-crypto';
import { AppState, Linking } from 'react-native';
import type { ChainConfig } from '../alert/chain';
import { COMPACT_TIMEOUT_MS, postIncident, probeHealth } from '../alert/https';
import { newItem, type OutboxItem } from '../alert/outbox';
import { buildAlert } from '../alert/packet';
import { createRunner } from '../alert/runner';
import { openComposer } from '../channels/composer';
import { nativeSms } from '../channels/sms';
import { i18n, type Locale } from '../i18n';
import { useSession } from '../state/session';
import { useSettings } from '../state/settings';
import { onLinkChange, setSmsChannelReady } from './connectivity';
import { replayFix } from './drive';
import { sqliteOutbox } from './outbox-sqlite';

/**
 * Alert pipeline (docs/04 §3.3): build packet → persist in the outbox → open the dialler on 14 (never auto-dial)
 * → the runner: HTTPS (full, then compact JSON) → silent SMS to GW1 → GW2 → emergency contacts, with backoff, until
 * ACK or 30 min. Without the native channel (old build, SEND_SMS refused) the status screen offers the composer.
 */
export const EMERGENCY = { civil: '14', civilAlt: '1021', gendarmerie: '1055', police: '17' } as const;

const publish = (item: OutboxItem) => useSession.getState().set({ alerts: { ...useSession.getState().alerts, [item.id]: item } });

/** Native SMS is usable: in this build AND SEND_SMS granted (kept fresh in the session, see refreshSmsPermission). */
export const nativeSmsReady = () => nativeSms.available && useSession.getState().perms.sms === 'granted';

export function chainConfig(): ChainConfig & { subscriptionId: number | null } {
  const s = useSettings.getState();
  return { nativeSms: nativeSmsReady(), gw1: s.gw1, gw2: s.gw2, contacts: s.contacts, subscriptionId: s.simSubscriptionId };
}

/** The text an emergency CONTACT receives: readable, no packet, no medical data (docs/11 #15). */
export function contactText(item: OutboxItem): string {
  const loc = item.json.location;
  const hasFix = item.locationAgeMin !== null;
  const d = new Date(item.createdAt);
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return i18n.t('sms.contact', {
    time,
    where: hasFix ? `https://maps.google.com/?q=${loc.lat.toFixed(5)},${loc.lon.toFixed(5)}` : i18n.t('sms.contactNoFix'),
    id: item.id,
  });
}

const runner = createRunner({
  store: sqliteOutbox,
  now: Date.now,
  https: {
    probe: () => probeHealth(fetch, useSettings.getState().serverUrl),
    post: (json) => postIncident(fetch, useSettings.getState().serverUrl, useSettings.getState().ingestKey, json),
    postCompact: (json) => postIncident(fetch, useSettings.getState().serverUrl, useSettings.getState().ingestKey, json, COMPACT_TIMEOUT_MS),
  },
  sms: nativeSms,
  config: chainConfig,
  humanText: contactText,
  publish,
});

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
  await runner.add(newItem(id, built.wire, built.json, now.getTime(), built.locationAgeMin)); // persisted before anything can fail
  if (await openDialler()) await runner.mutate(id, (i) => ({ ...i, diallerOpenedAt: Date.now() }));
  void runner.tick();
  return id;
}

export type SmsOpen = 'opened' | 'no_gateway' | 'unavailable';

/**
 * Composer fallback: the system SMS app pre-filled with the packet to GW1 (GW2 if GW1 is empty). The person presses
 * Send; Android never says whether it went, so the screen says "composer opened", not "sent".
 */
export async function openSmsComposer(id: string): Promise<SmsOpen> {
  const item = runner.get(id);
  const { gw1, gw2 } = useSettings.getState();
  const to = gw1 || gw2;
  if (!item) return 'unavailable';
  if (!to) return 'no_gateway';
  if ((await openComposer(to, item.wire)) !== 'opened') return 'unavailable';
  await runner.mutate(id, (i) => ({ ...i, sms: { composerOpenedAt: Date.now(), to } }));
  return 'opened';
}

/** Run every due step once (HTTPS retry, SMS plan). Safe to call often (serialised). force = retry HTTPS now. */
export const deliverDue = (force = false) => runner.tick(force);

/** SEND_SMS as Android has it now (the person may change it in system settings at any time). */
export async function refreshSmsPermission(): Promise<void> {
  const p = await nativeSms.permission();
  const sms = p === 'granted' ? 'granted' : p === 'blocked' || p === 'unsupported' ? 'denied' : 'undetermined';
  const s = useSession.getState();
  if (s.perms.sms !== sms) s.set({ perms: { ...s.perms, sms } });
  const { gw1, gw2 } = useSettings.getState();
  setSmsChannelReady(nativeSmsReady() && Boolean(gw1 || gw2));
}

export async function requestSmsPermission(): Promise<void> {
  const r = await nativeSms.requestPermission();
  await refreshSmsPermission();
  // Android's check() cannot tell "refused for good" from "not asked yet": keep what the request said
  if (r === 'blocked') useSession.getState().set({ perms: { ...useSession.getState().perms, sms: 'denied' } });
}

let loop: ReturnType<typeof setInterval> | null = null;
/** Load the persisted outbox (alerts survive a kill) and keep delivering; retry at once when the link comes back. */
export async function startOutbox() {
  if (loop) return;
  await refreshSmsPermission();
  await runner.load();
  useSession.getState().set({ alerts: Object.fromEntries(runner.list().map((i) => [i.id, i])) });
  loop = setInterval(() => void runner.tick(), 1_000);
  onLinkChange((link) => { if (link === 'online') void runner.tick(true); });
  useSettings.subscribe((s, prev) => { if (s.gw1 !== prev.gw1 || s.gw2 !== prev.gw2) void refreshSmsPermission(); });
  AppState.addEventListener('change', (st) => { if (st === 'active') void refreshSmsPermission(); });
}
