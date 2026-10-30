import { z } from 'zod';
import type { IncidentJson } from '@najda/api-contract';
import { generateIncidentId } from '@najda/shared';

/**
 * D10 witness form: 4 fields (vehicles · who is hurt · danger · location confirm) + send.
 * Arrives as a plain urlencoded form (old Android browsers, no JS) or as JSON; both go through this schema.
 */
export const WITNESS_KINDS = ['car', 'moto', 'truck', 'bus', 'pedestrian'] as const;
export const WITNESS_STATES = ['unresponsive', 'breathing', 'bleeding'] as const;
export const WITNESS_DANGERS = ['trapped', 'fire', 'child'] as const;

const many = <T extends readonly [string, ...string[]]>(values: T) =>
  z.preprocess((v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]), z.array(z.enum(values)).max(values.length));
const count = z.enum(['0', '1', '2', '3']).transform(Number);

export const WitnessForm = z
  .object({
    vehicles: count.refine((n) => n >= 1, 'at least one vehicle'),
    kinds: many(WITNESS_KINDS),
    hurt: count,
    state: many(WITNESS_STATES),
    danger: many(WITNESS_DANGERS),
    /** the witness confirms they are at / can see the accident near the place shown */
    here: z.literal('yes'),
  })
  .strict();
export type WitnessForm = z.infer<typeof WitnessForm>;

/** Form fields (URLSearchParams or FormData) → plain object, repeated keys as arrays. */
export function formToObject(form: Iterable<[string, unknown]>): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const [k, v] of form) {
    if (typeof v !== 'string') continue;
    const prev = out[k];
    out[k] = prev === undefined ? v : Array.isArray(prev) ? [...prev, v] : [prev, v];
  }
  return out;
}

/**
 * Form → the v1 JSON contract, so the witness follows the ONE ingest path (`SW` packet, docs/03 flow B).
 * The position is the incident's (server-side, exact); the page never had it. A fresh id = an independent report.
 */
export function witnessJson(
  f: WitnessForm,
  at: { lat: number; lon: number },
  now: Date,
  id: string = generateIncidentId(),
): IncidentJson {
  return {
    v: 1,
    incident_id: id,
    source: 'witness',
    created_at: now.toISOString(),
    location: { lat: at.lat, lon: at.lon },
    scene: {
      vehicles: f.vehicles,
      persons: f.hurt,
      kinds: f.kinds.length > 0 ? [...f.kinds] : ['other'],
      flags: [...f.state, ...f.danger],
      ...(f.danger.includes('fire') && { fire: true }),
    },
  };
}
