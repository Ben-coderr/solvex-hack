import NetInfo from '@react-native-community/netinfo';
import { probeHealth } from '../alert/https';
import { useSession, type Link } from '../state/session';
import { useSettings } from '../state/settings';

/**
 * The status banner trusts a 2 s HEAD /api/health, never only NetInfo ("connected" behind a captive portal or with
 * no credit is not online). Probes every 10 s and at once on any network change; listeners hear every transition.
 */
const PERIOD_MS = 10_000;
/** P5 sets this when the native SMS channel is ready; until then "no data" is shown as offline, honestly. */
export let smsChannelReady = false;

type Listener = (link: Link, prev: Link) => void;
const listeners = new Set<Listener>();
export const onLinkChange = (l: Listener) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

let timer: ReturnType<typeof setInterval> | null = null;
let inflight = false;

export async function probeNow(): Promise<Link> {
  if (inflight) return useSession.getState().link;
  inflight = true;
  try {
    const ok = await probeHealth(fetch, useSettings.getState().serverUrl);
    const link: Link = ok ? 'online' : smsChannelReady ? 'sms_only' : 'offline';
    const prev = useSession.getState().link;
    if (link !== prev) {
      useSession.getState().set({ link });
      listeners.forEach((l) => l(link, prev));
    }
    return link;
  } finally {
    inflight = false;
  }
}

export function startConnectivity() {
  if (timer) return () => {};
  void probeNow();
  timer = setInterval(() => void probeNow(), PERIOD_MS);
  const unsub = NetInfo.addEventListener(() => void probeNow());
  const unsubUrl = useSettings.subscribe((s, p) => { if (s.serverUrl !== p.serverUrl) void probeNow(); });
  return () => {
    if (timer) clearInterval(timer);
    timer = null;
    unsub();
    unsubUrl();
  };
}
