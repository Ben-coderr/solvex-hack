/**
 * Alert → DZ-MSD packet (the SMS form) + IncidentJson (the HTTPS form), built from ONE DzmsdPacket so both
 * channels carry the same id and content. Pure: encoding and the hint come from @najda/shared, never copied.
 * The band/score/conf are the phone's HINT; the server recomputes with assess() and is authoritative.
 */
import {
  FLAG_LETTER, KIND_LETTER, SOURCE_LETTER,
  type IncidentJson,
} from '@najda/api-contract';
import {
  assess, encodeDzmsd, encodePlusCode, formatHHMM, inputFromPacket,
  type DzmsdPacket, type Flag, type Kind, type Source,
} from '@najda/shared';
import type { Crash } from '../detector/detector';

export interface Fix {
  lat: number;
  lon: number;
  /** horizontal accuracy, m */
  accM?: number;
  /** when the fix was taken (ms epoch) */
  at: number;
}

export interface AlertInput {
  id: string;
  source: Source;
  now: Date;
  /** best fix: current, else last known; null = never had one (the alert still goes out) */
  fix: Fix | null;
  crash?: Crash;
  /** the countdown expired with no answer (flag N) */
  noResponse?: boolean;
  kinds?: Kind[];
  battery?: number;
  lang?: 'ar' | 'fr' | 'en';
  appVersion?: string;
}

export interface BuiltAlert {
  packet: DzmsdPacket;
  wire: string;
  json: IncidentJson;
  /** fix age in whole minutes at build time (null = no fix at all: coordinates 0,0, the dispatcher calls back) */
  locationAgeMin: number | null;
}

const round5 = (x: number) => Math.round(x * 1e5) / 1e5;
const clampInt = (x: number, max: number) => Math.max(0, Math.min(max, Math.round(x)));
const invert = <K extends string, V extends string>(m: Record<K, V>) =>
  Object.fromEntries(Object.entries(m).map(([k, v]) => [v, k])) as Record<V, K>;
const SOURCE_WORD = invert(SOURCE_LETTER);
const KIND_WORD = invert(KIND_LETTER);
const FLAG_WORD = invert(FLAG_LETTER);

/** ISO 8601 in Algeria time (UTC+1 all year), e.g. 2026-10-30T14:32:07+01:00 (the contract wants an offset). */
export function isoAlgiers(d: Date): string {
  const local = new Date(d.getTime() + 60 * 60_000);
  return `${local.toISOString().slice(0, 19)}+01:00`;
}

export function buildAlert(a: AlertInput): BuiltAlert {
  const lat = a.fix ? round5(a.fix.lat) : 0;
  const lon = a.fix ? round5(a.fix.lon) : 0;
  const flags: Flag[] = a.noResponse ? ['N'] : [];
  const kinds: Kind[] = a.kinds?.length ? a.kinds : ['C'];
  const c = a.crash;

  const base: DzmsdPacket = {
    id: a.id, band: 'U', score: 0, conf: 'L',
    lat, lon, time: formatHHMM(a.now), src: a.source,
    veh: 1, pers: 1, kinds,
    ...(c && { dv: clampInt(c.dvKmh, 999), g: clampInt(c.peakG, 999) }),
    ...(c?.rollover && { roll: true }),
    ...(flags.length > 0 && { flags }),
    ...(a.fix && { plus: encodePlusCode(lat, lon) }),
  };
  const hint = assess(inputFromPacket(base, { ...(c?.multiImpact && { multiImpact: true }), ...(a.noResponse && { noResponse: true }) }));
  const packet: DzmsdPacket = { ...base, band: hint.band, score: hint.score, conf: hint.conf };

  const json: IncidentJson = {
    v: 1,
    incident_id: a.id,
    source: SOURCE_WORD[a.source],
    created_at: isoAlgiers(a.now),
    location: {
      lat, lon,
      ...(a.fix?.accM !== undefined && { acc_m: Math.round(a.fix.accM) }),
      ...(packet.plus && { plus_code: packet.plus }),
    },
    ...(c || a.noResponse
      ? {
          crash: {
            ...(c && { dv_kmh: packet.dv!, peak_g: packet.g!, rollover: c.rollover, multi_impact: c.multiImpact }),
            ...(a.noResponse && { no_response: true }),
          },
        }
      : {}),
    scene: { vehicles: packet.veh, persons: packet.pers, kinds: kinds.map((k) => KIND_WORD[k]), flags: flags.map((f) => FLAG_WORD[f]) },
    ...(a.lang && { contact: { lang: a.lang } }),
    device: { app: `najda-mobile/${a.appVersion ?? '0'}`, ...(a.battery !== undefined && { battery: clampInt(a.battery, 100) }) },
    hint: { band: packet.band, score: packet.score, conf: packet.conf },
  };

  return {
    packet,
    wire: encodeDzmsd(packet),
    json,
    locationAgeMin: a.fix ? Math.max(0, Math.floor((a.now.getTime() - a.fix.at) / 60_000)) : null,
  };
}
