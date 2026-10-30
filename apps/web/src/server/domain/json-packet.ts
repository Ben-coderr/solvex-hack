import {
  FLAG_LETTER, KIND_LETTER, SOURCE_LETTER,
  type IncidentJson,
} from '@sellekni/api-contract';
import {
  FLAG_ORDER, KIND_ORDER, encodePlusCode, formatHHMM,
  type Band, type Confidence, type DzmsdPacket, type Flag, type Kind,
} from '@sellekni/shared';

export interface ClientHint { band: Band; score: number; conf: Confidence }

/**
 * JSON channel → the same DzmsdPacket the SMS path produces, so there is ONE scoring path (docs/05 §2).
 * The packet's band/score/conf are placeholders when the phone sent no hint; the server recomputes anyway.
 * Not carried: multi_impact, heading, accuracy, battery (not part of DZ-MSD v1), medical (never stored here).
 */
export function packetFromJson(j: IncidentJson): { packet: DzmsdPacket; hint: ClientHint | null; crashedAt: Date } {
  const crashedAt = new Date(j.created_at);
  const flags = new Set<Flag>(j.scene.flags.map((f) => FLAG_LETTER[f]));
  if (j.crash?.no_response) flags.add('N');
  if (j.scene.fire) flags.add('F');
  const kinds = new Set<Kind>(j.scene.kinds.map((k) => KIND_LETTER[k]));
  const hint = j.hint ?? null;
  const lat = Math.round(j.location.lat * 1e5) / 1e5;
  const lon = Math.round(j.location.lon * 1e5) / 1e5;

  const packet: DzmsdPacket = {
    id: j.incident_id,
    band: hint?.band ?? 'U',
    score: hint?.score ?? 0,
    conf: hint?.conf ?? 'L',
    lat, lon,
    time: formatHHMM(crashedAt),
    src: SOURCE_LETTER[j.source],
    veh: j.scene.vehicles,
    pers: j.scene.persons,
    kinds: KIND_ORDER.filter((k) => kinds.has(k)),
    ...(j.crash?.dv_kmh !== undefined && { dv: j.crash.dv_kmh }),
    ...(j.crash?.peak_g !== undefined && { g: j.crash.peak_g }),
    ...(j.crash?.rollover && { roll: true }),
    ...(flags.size > 0 && { flags: FLAG_ORDER.filter((f) => flags.has(f)) }),
    ...(j.vitals?.hr !== undefined && { hr: j.vitals.hr }),
    ...(j.vitals?.spo2 !== undefined && { spo2: j.vitals.spo2 }),
    plus: encodePlusCode(lat, lon),
  };
  return { packet, hint, crashedAt };
}

/** The JSON stored as the report's raw text: stable key order, medical removed (never stored with the report). */
export function rawFromJson(j: IncidentJson): string {
  const { medical: _medical, ...rest } = j;
  return JSON.stringify(rest);
}
