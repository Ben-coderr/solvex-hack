'use client';
import { Activity, Clock, Map as MapIcon, MessageSquareText, Radio, Route, Wifi, WifiOff, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useSyncExternalStore } from 'react';
import { useRealtimeState } from '@/components/dispatch/providers';
import { useHealth, useSystemStatus } from '@/lib/dispatch';
import { useNow } from '@/lib/use-now';
import { cn } from '@/lib/utils';
import type { ConnectivityMode } from '@/components/ui/status-banner';

export type TilesMode = 'offline' | 'online' | 'none';

const subscribe = (cb: () => void) => {
  window.addEventListener('online', cb);
  window.addEventListener('offline', cb);
  return () => {
    window.removeEventListener('online', cb);
    window.removeEventListener('offline', cb);
  };
};
/** navigator.onLine (true during SSR: the first paint never claims an outage it has not seen). */
export const useBrowserOnline = () => useSyncExternalStore(subscribe, () => navigator.onLine, () => true);

/**
 * online: browser + our server reachable · sms_only: no internet but the local server answers (SMS via the gateway
 * phone still flows in) · offline: our server is unreachable (data on screen may be stale).
 */
export function useConnectivity(): ConnectivityMode {
  const online = useBrowserOnline();
  const health = useHealth();
  if (health.isError) return 'offline';
  return online ? 'online' : 'sms_only';
}

type Tone = 'ok' | 'warn' | 'danger' | 'muted';
const TONE: Record<Tone, string> = {
  ok: 'text-status-ok', warn: 'text-status-warn', danger: 'text-status-danger', muted: 'text-muted-foreground',
};

function Item({ icon: Icon, tone, label, testId }: { icon: LucideIcon; tone: Tone; label: string; testId?: string }) {
  return (
    <li className="inline-flex items-center gap-1.5 whitespace-nowrap" data-testid={testId} data-tone={tone}>
      <Icon aria-hidden className={cn('size-4 shrink-0', TONE[tone])} />
      <span className={tone === 'ok' ? 'text-text' : TONE[tone]}>{label}</span>
    </li>
  );
}

/** "14:33:07" in Algeria local time (UTC+1), Western digits everywhere. */
function clock(ms: number) {
  const d = new Date(ms + 3_600_000);
  return [d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()].map((n) => String(n).padStart(2, '0')).join(':');
}

/** Top strip (docs/06 §5): online · realtime · SMS gateway · OSRM · map tiles · clock. Every probe says what it saw. */
export function StatusStrip({ tiles, className }: { tiles: TilesMode; className?: string }) {
  const t = useTranslations('strip');
  const conn = useConnectivity();
  const rt = useRealtimeState();
  const st = useSystemStatus().data;
  const now = useNow(1000);
  const gw = st?.smsGateway;
  const osrm = st?.osrm;
  return (
    <ul aria-label={t('label')} className={cn('flex flex-wrap items-center gap-x-5 gap-y-1 text-sm', className)}>
      <Item testId="strip-online" icon={conn === 'offline' ? WifiOff : Wifi} tone={conn === 'online' ? 'ok' : conn === 'sms_only' ? 'warn' : 'danger'}
        label={conn === 'online' ? t('online') : conn === 'sms_only' ? t('noInternet') : t('offline')} />
      <Item testId="strip-realtime" icon={Activity} tone={rt === 'live' ? 'ok' : rt === 'connecting' ? 'muted' : 'warn'}
        label={rt === 'live' ? t('realtime') : rt === 'connecting' ? t('realtimeConnecting') : t('realtimeDown')} />
      <Item testId="strip-gateway" icon={MessageSquareText} tone={gw === 'ok' ? 'ok' : gw === 'sim' ? 'warn' : gw === 'down' ? 'danger' : 'muted'}
        label={gw === 'sim' ? t('gatewaySim') : gw === 'down' ? t('gatewayDown') : t('gateway')} />
      <Item testId="strip-osrm" icon={Route} tone={osrm === 'ok' ? 'ok' : osrm ? 'warn' : 'muted'}
        label={osrm === 'ok' ? t('osrm') : osrm === 'down' ? t('osrmDown') : t('osrmOff')} />
      <Item testId="strip-tiles" icon={MapIcon} tone={tiles === 'offline' ? 'ok' : 'warn'}
        label={tiles === 'offline' ? t('tilesOffline') : tiles === 'online' ? t('tilesOnline') : t('tilesNone')} />
      <li className="ms-auto inline-flex items-center gap-1.5" aria-label={t('clock')}>
        <Clock aria-hidden className="size-4 text-muted-foreground" />
        <time className="packet-ltr font-display text-lg tabular-nums" suppressHydrationWarning>{clock(now)}</time>
      </li>
      {rt === 'down' && <li className="sr-only"><Radio aria-hidden />{t('pollingFallback')}</li>}
    </ul>
  );
}
